class SilMShortener extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({mode: "open"});
    shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host {
          margin: 2px 0;
          padding: 0;
          flex: 0 1 auto; /* flex item from #compose_tweet_area */
        }
        #shortener_input_area {
          display: flex;
          flex-flow: row nowrap;
          justify-content: flex-start;
        }
        #shortener_input_area > #shortener_text {
          width: calc(100% - 2px);
          color: var(--main-font-color);
          flex: 0 1 auto; /* flex item from #shortener_input_area */
        }
        #shortener_input_area > #shortener_text.idle {
          color: #aaa;
        }
        #shortener_input_area > #shortening {
          width: 16px;
          height: 16px;
          margin: 0 0 0 2px;
          flex: 0 1 auto; /* flex item from #shortener_input_area */
          display: none;

          animation: rotate 2s;
          animation-iteration-count: infinite;
          transform-origin: 6.6px 7.4px;
        }
        #shortener_input_area > #shortening.show {
          display: block;
        }
        @keyframes rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        #shortener_button {
          left: calc((100% - 150px) / 2);
          position: absolute;
          width: 150px;
          border-bottom-left-radius: 5px 5px;
          border-bottom-right-radius: 5px 5px;
          background-color: var(--main-bg-color);
          border: 1px solid var(--main-bd-color);
          border-top: 0px;
          text-align: center;
          cursor: pointer;

          transition-property: opacity, z-index;
          transition-duration: 200ms;
          transition-timing-function: ease-out;
          z-index: -1;
          opacity: 0;
        }
        #shortener_button.show {
          transition-property: opacity, z-index;
          transition-duration: 200ms;
          transition-timing-function: ease-out;
          z-index: 99999;
          opacity: 1;
        }
        #shortener_button.show:hover {
          background-color: var(--hover-bg-color);
        }
      </style>
      <div id="shortener_input_area">
        <input type="text" class="idle" id="shortener_text"></input>
        <span id="shortening" class="glyphicon glyphicon-repeat"></span>
      </div>
      <div id="shortener_button" class="i18n"></div>
    `;
    const idleStrings = chrome.i18n.getMessage("shortenerIdleString");
    Object.defineProperties(this, {
      "idleStrings": {
        get: () => {
          return idleStrings;
        }
      },
      "io": {
        value: new IntersectionObserver((changes) => {
          for(let change of changes) {
            let target = change.target;
            if(change.intersectionRatio < 50) {
              this.clear();
            }
          }
        }, {
          threshold: [0, 1]
        })
      },
      "context": {
        value: {},
        writable: true
      }
    });
  }
  connectedCallback() {
    this.clear();
    this.io.observe(this);
    doLocalization(this.shadowRoot.querySelectorAll(".i18n"));
    // event binding
    const input = this.shadowRoot.querySelector("#shortener_text");
    if(!input.handleInput) {
      input.handleInput = (event) => {
        this.checkShortenable();
      };
      input.addEventListener("input", input.handleInput);
    }
    if(!input.handleFocus) {
      input.handleFocus = (event) => {
        const input = this.shadowRoot.querySelector("#shortener_text");
        if(!!input) {
          input.classList.remove("idle");
          if(!(/^https?:\/\//i.test((input.value || "").trim()))) {
            input.value = "";
          }
          $(input).autocomplete("search", "http");
        }
      };
      input.addEventListener("focus", input.handleFocus);
    }
    if(!input.handleBlur) {
      input.handleBlur = (event) => {
        this.checkShortenable(true);
      };
      input.addEventListener("blur", input.handleBlur);
    }
    if(!input.handleKeyDown) {
      input.handleKeyDown = (event) => {
        if(!!event.isComposing
        || !!event.defaultPrevented
        || (event.key !== "Enter" && event.key !== "Escape")) {
          return;
        }
        event.preventDefault();
        if(event.key === "Enter") {
          this.shorten(event.ctrlKey || Composer.macCommandKey);
          this.clear();
        } else if(event.key === "Escape") {
          this.blur();
        }
      };
      input.addEventListener("keydown", input.handleKeyDown);
    }
    if(!input.handleMouseDown) {
      input.handleMouseDown = (event) => {
        const input = this.shadowRoot.querySelector("#shortener_text");
        if(input.classList.contains("idle")) {
          event.target.blur();
        }
      };
      input.addEventListener("mousedown", input.handleMouseDown);
    }
    const button = this.shadowRoot.querySelector("#shortener_button");
    if(!button.handleClick) {
      button.handleClick = (event) => {
        this.shorten(event.ctrlKey || Composer.macCommandKey);
        this.clear();
      };
      button.addEventListener("click", button.handleClick);
    }
    // initialize autocomplete
    $(this.shadowRoot.querySelector("#shortener_text")).autocomplete({
      create: (event, ui) => {
        $(event.target).data("ui-autocomplete").liveRegion.remove();
      },
      source: (request, response) => {
        chrome.tabs.query({
            status: "complete",
            windowType: "normal"
          }, (tabs) => {
          this.context = tabs.filter((entry) => /^https?:\/\//i.test(entry.url));
          response(this.context.map((entry)  => entry.url));
        });
      },
      close: (event, ui) => {
        this.checkShortenable(true);
      },
      open: (event, ui) => {
        $(".ui-autocomplete").css({
          overflowX: 'hidden',
          overflowY: 'auto',
          maxHeight: '200px'
        });
      }
    });
  }
  disconnectedCallback() {
    this.io.unobserve(this);
    // event unbinding
    const input = this.shadowRoot.querySelector("#shortener_text");
    input.removeEventListener("input", input.handleInput);
    input.removeEventListener("focus", input.handleFocus);
    input.removeEventListener("blur", input.handleBlur);
    input.removeEventListener("keydown", input.handleKeyDown);
    input.removeEventListener("mousedown", input.handleMouseDown);
    const button = this.shadowRoot.querySelector("#shortener_button");
    button.removeEventListener("click", button.handleClick);
  }
  static get observedAttributes() {
    return [""];
  }
  attributeChangedCallback(attrName, oldVal, newVal) {
    if(!window || !this.isConnected) {
      return;
    }
    switch(attrName) {
      default:
        break;
    }
  }
  adoptedCallback() {
  }
  checkShortenable(isClear = false) {
    const input = this.shadowRoot.querySelector("#shortener_text");
    const text = (input.value || "").trim();
    const button = this.shadowRoot.querySelector("#shortener_button");
    if(/https?:\/\//i.test(text)) {
      input.classList.remove("idle");
      button.classList.add("show");
    } else {
      input.classList.add("idle");
      button.classList.remove("show");
      if(isClear) {
        this.clear();
      }
    }
  }
  clear() {
    const input = this.shadowRoot.querySelector("#shortener_text");
    input.classList.add("idle");
    input.value = this.idleStrings;
    const button = this.shadowRoot.querySelector("#shortener_button");
    button.classList.remove("show");
  }
  shorten(withoutQuery = false) {
    const input = this.shadowRoot.querySelector("#shortener_text");
    let target = (input.value || "").trim();
    if(withoutQuery) {
      target = target.split('?')[0];
    }
    this.processing(true);
    tweetManager.shortener.shorten(target, (success, shortUrl, longUrl) => {
      this.processing(false);
      if(success && shortUrl) {
        if(OptionsBackend.get("share_include_title")) {
          if(longUrl) {
            const filterd = this.context.filter((entry) => {
              return longUrl == entry.url || longUrl == entry.url.split('?')[0];
            }) || [];
            if(filterd.length > 0) {
              shortUrl = filterd[0].title + ' - ' + shortUrl;
            }
          }
        }
        Composer.addText(shortUrl);
      } else if(!success) {
        Renderer.showError(shortUrl);
      }
      Composer.showComposeArea(true);
    });
  }
  processing(bool) {
    const input = this.shadowRoot.querySelector("#shortener_text");
    const shortening = this.shadowRoot.querySelector("#shortening");
    if(bool === true) {
      shortening.classList.add("show");
      input.setAttribute("disabled", "disabled");
    } else if(bool === false) {
      shortening.classList.remove("show");
      input.removeAttribute("disabled");
    }
  }
}
customElements.define("silm-shortener", SilMShortener);
