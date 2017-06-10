class SilMUpdateTweets extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.handleTransitionend = (event) => {
      switch(true) {
        case this.classList.contains("fadeIn"):
          this.setAttribute("class", "visible");
          break;
        case this.classList.contains("fadeOut"):
          // go to default
        default:
          this.removeAttribute("class");
          break;
      }
    };
    this.handleClick = (event) => {
      loadNewTweets();
      this.hide();
    };
    return Object.seal(this);
  }
  connectedCallback() {
    this.render();
    // event binding
    this.addEventListener("click", this.handleClick);
    this.addEventListener("transitionend", this.handleTransitionend);
  }
  disconnectedCallback() {
    // event unbinding
    this.removeEventListener("click", this.handleClick);
    this.removeEventListener("transitionend", this.handleTransitionend);
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
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host {
          visibility: hidden;
          flex: 10 0 auto; /* flex item from .header_links */
          margin: 5px 0 0;
          opacity: 0;
        }
        :host(.visible) {
          visibility: visible;
          opacity: 1;
        }
        :host(.fadeIn) {
          visibility: visible;
          transition-property: opacity;
          transition-duration: 300ms;
          transition-timing-function: ease-out;
          opacity: 1;
        }
        :host(.fadeOut) {
          visibility: visible;
          transition-property: opacity;
          transition-duration: 100ms;
          transition-timing-function: ease-out;
          opacity: 0;
        }
        :host > div {
          font-size: 9pt;
          font-weight: bold;
          text-align: center;
          cursor: pointer;
          border: solid 1px #999;
          border-radius: .4em;
          background-color: #999;
          color: #f4f4f4;
        }
        :host > div:hover {
          background-color: var(--main-bg-color);
          color: #555;
        }
      </style>
      <div></div>
    `;
  }
  show(count = 0) {
    if(count < 1) {
      return this.hide();
    }
    this.shadowRoot.querySelector("div").textContent = chrome.i18n.getMessage("newTweetsAvailable", [count, chrome.i18n.getMessage((count > 1)? "tweet_plural": "tweet_singular")]);
    if(!this.classList.contains("visible")) {
      this.classList.remove("fadeOut");
      this.classList.add("fadeIn");
    }
  }
  hide() {
    if(this.classList.contains("fadeOut")) {
      return;
    } else if(this.classList.contains("visible") || this.classList.contains("fadeIn")) {
      this.classList.remove("fadeIn");
      this.classList.add("fadeOut");
    } else {
      this.removeAttribute("class");
    }
  }
}
customElements.define("silm-updatetweets", SilMUpdateTweets);
