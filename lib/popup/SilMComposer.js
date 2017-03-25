class SilMComposer extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host {
          position: absolute;
          top: 0;
          left: 0;
          width: calc(100% - 2px);
          height: 226px;
          overflow: hidden;
          z-index: 15000;

          display: flex;
          flex-flow: column nowrap;
          justify-content: flex-end;

          background-color: white;
          transition-property: transform, box-shadow;
          transition-duration: 300ms;
          transition-timing-function: ease-out;
          transform: translateY(-200px);
          box-shadow: 0px 0px 0px 0px rgba(0,0,0,0);
        }
        :host([composed="true"]) {
          transition-property: transform, box-shadow;
          transition-duration: 300ms;
          transition-timing-function: ease-out;
          transform: translateY(0px);
          box-shadow: 0px 5px 3px -1px rgba(0, 0, 0, calc(1.0 / 3));
        }
        #compose_tweet {
          flex: 0 1 auto; /* flex item from silm-composer */
          font-size: 9pt;
          font-weight: bold;
          margin: 0;
          padding: 0;
          text-align: center;
          cursor: pointer;
          color: #555;
          background-color: var(--main-bg-color);
          border: 1px solid var(--main-bd-color);
          padding: 3px;
        }
        #composeText {
          margin-left: 1em;
        }
      </style>
      <slot></slot>
      <div id="compose_tweet">
        <span class="glyphicon glyphicon-menu-down"></span><span id="composeText" class="i18n"></span>
      </div>
    `;
  }
  connectedCallback() {
    doLocalization(this.shadowRoot.querySelectorAll(".i18n"));
    // event binding
    if(!this.handleTransitionend) {
      this.handleTransitionend = (event) => {
        if(event.propertyName === "transform") {
          if(this.getAttribute("composed") !== "true") {
            document.activeElement.blur();
          }
        }
      };
      this.addEventListener("transitionend", this.handleTransitionend);
    }
    const composeTweet = this.shadowRoot.querySelector("#compose_tweet");
    if(!!composeTweet && !composeTweet.handleClick) {
      composeTweet.handleClick = () => {
        Composer.showComposeArea();
      };
      composeTweet.addEventListener("click", composeTweet.handleClick);
    }
  }
  disconnectedCallback() {
    // event unbinding
    if(!!this.handleTransitionend) {
      this.removeEventListener("transitionend", this.handleTransitionend);
    }
    const composeTweet = this.shadowRoot.querySelector("#compose_tweet");
    if(!!composeTweet && !!composeTweet.handleClick) {
      composeTweet.removeEventListener("click", composeTweet.handleClick);
    }
  }
  static get observedAttributes() {
    return ["composed"];
  }
  attributeChangedCallback(attrName, oldVal, newVal) {
    if(!window || !this.isConnected) {
      return;
    }
    switch(attrName) {
      case "composed":
        this.checkComposed(newVal);
        break;
      default:
        break;
    }
  }
  adoptedCallback() {
  }
  checkComposed(composed = this.getAttribute("composed") || "false") {
    const composeText = this.shadowRoot.querySelector("#composeText");
    const composeIcon = this.shadowRoot.querySelector("#compose_tweet > .glyphicon").classList;
    if(composed === "true") {
      composeText.textContent = chrome.i18n.getMessage("closeComposeTweet");
      composeIcon.remove("glyphicon-menu-down");
      composeIcon.add("glyphicon-menu-up");
    } else if(composed === "false") {
      composeText.textContent = chrome.i18n.getMessage("composeText");
      composeIcon.remove("glyphicon-menu-up");
      composeIcon.add("glyphicon-menu-down");
    }
  }
}
customElements.define("silm-composer", SilMComposer);
