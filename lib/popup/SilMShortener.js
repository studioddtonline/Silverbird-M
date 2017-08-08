class SilMShortener extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: "open"});
    const idleStrings = chrome.i18n.getMessage("shortenerIdleString");
    Object.defineProperties(this, {
      "idleStrings": {
        get: () => {
          return idleStrings;
        }
      },
      "context": {
        value: {},
        writable: true
      }
    });
  }
  connectedCallback() {
    this.render();
    // event binding
    const input = this.shadowRoot.querySelector("#shortener_text");
    input.handleInput = (event) => {
      this.checkShortenable();
    };
    input.addEventListener("input", input.handleInput);
    input.handleFocus = (event) => {
      const input = this.shadowRoot.querySelector("#shortener_text");
      input.classList.remove("idle");
      if(!(/^https?:\/\//i.test((input.value || "").trim()))) {
        input.value = "";
      }
      $(input).autocomplete("search", "http");
    };
    input.addEventListener("focus", input.handleFocus);
    input.handleBlur = (event) => {
      this.checkShortenable(true);
    };
    input.addEventListener("blur", input.handleBlur);
    input.handleKeyDown = (event) => {
      if(!!event.isComposing
      || !!event.defaultPrevented
      || (event.key !== "Enter" && event.key !== "Escape")) {
        return;
      }
      event.preventDefault();
      if(event.key === "Enter") {
        this.shorten(event.ctrlKey || event.metaKey);
        this.clear();
      } else if(event.key === "Escape") {
        this.blur();
      }
    };
    input.addEventListener("keydown", input.handleKeyDown);
    input.handleMouseDown = (event) => {
      const input = this.shadowRoot.querySelector("#shortener_text");
      if(input.classList.contains("idle")) {
        event.target.blur();
      }
    };
    input.addEventListener("mousedown", input.handleMouseDown);
    const button = this.shadowRoot.querySelector("#shortener_button");
    button.handleClick = (event) => {
      this.shorten(event.ctrlKey || event.metaKey);
      this.clear();
    };
    button.addEventListener("click", button.handleClick);
    this.handleSilmMessage = (event = {detail: null}) => {
      if(!event.detail || event.detail.type !== "updateStatus" || !event.detail.target) {
        return;
      }
      Object.entries(event.detail.target).forEach(([key, value], index) => {
        switch(key) {
          case "composerOpend":
          case "composerClosed":
            this.clear();
            break;
        }
      });
    };
    window.addEventListener("silmMessage", this.handleSilmMessage);
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
    // event unbinding
    const input = this.shadowRoot.querySelector("#shortener_text");
    input.removeEventListener("input", input.handleInput);
    input.removeEventListener("focus", input.handleFocus);
    input.removeEventListener("blur", input.handleBlur);
    input.removeEventListener("keydown", input.handleKeyDown);
    input.removeEventListener("mousedown", input.handleMouseDown);
    const button = this.shadowRoot.querySelector("#shortener_button");
    button.removeEventListener("click", button.handleClick);
    window.removeEventListener("silmMessage", this.handleSilmMessage);
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
    if(/https?:\/\//i.test(text)) {
      input.classList.remove("idle");
    } else {
      input.classList.add("idle");
      if(isClear) {
        this.clear();
      }
    }
  }
  clear() {
    const input = this.shadowRoot.querySelector("#shortener_text");
    input.classList.add("idle");
    input.value = this.idleStrings;
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
    });
  }
  processing(bool) {
    const input = this.shadowRoot.querySelector("#shortener_text");
    if(bool === true) {
      showLoading();
      input.setAttribute("disabled", "disabled");
    } else if(bool === false) {
      hideLoading();
      input.removeAttribute("disabled");
    }
  }
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host {
          margin: 2px 0;
          padding: 0;
          flex: 0 1 auto; /* flex item from #compose_tweet_area */
        }
        input {
          width: calc(100% - 2px);
          color: var(--main-font-color);
          font-size: 1em;
        }
        input.idle {
          color: #aaa;
        }
        button {
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
        input:not(.idle) + button {
          transition-property: opacity, z-index;
          transition-duration: 200ms;
          transition-timing-function: ease-out;
          z-index: 99999;
          opacity: 1;
        }
        input:not(.idle) + button:hover {
          background-color: var(--hover-bg-color);
        }
      </style>
      <input type="text" class="idle" id="shortener_text" value="${this.idleStrings}"></input>
      <button id="shortener_button">${chrome.i18n.getMessage("shortener_button")}</button>
    `;
  }
}
customElements.define("silm-shortener", SilMShortener);
