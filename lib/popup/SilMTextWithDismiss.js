class SilMTextWithDismiss extends HTMLElement {
  constructor() {
    super();
    this.buildShadow();
  }
  buildShadow() {
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host {
          flex: 0 1 auto; /* flex item from #compose_tweet_area */
          display: none;
          font-size: .8em;
        }
        :host(:not([text=""])) {
          display: flex;
          flex-flow: row nowrap;
          align-items: center;
        }
        :host(:not([text])) {
          display: none;
        }
      </style>
      <span class="glyphicon glyphicon-remove-circle" id="dismiss"></span>
      <span id="text"></span>
    `;
  }
  connectedCallback() {
    // event binding
    if(!this.handleDismissClick) {
      this.handleDismissClick = (event) => {
        this.setAttribute("text", "");
        this.dismissCallback();
      };
      this.shadowRoot.querySelector("#dismiss").addEventListener("click", this.handleDismissClick);
    }
  }
  disconnectedCallback() {
    // event unbinding
    if(!!this.handleDismissClick) {
      this.shadowRoot.querySelector("#dismiss").removeEventListener("click", this.handleDismissClick);
    }
  }
  static get observedAttributes() {
    return ["text"];
  }
  attributeChangedCallback(attrName, oldVal, newVal) {
    if(!window || !this.isConnected) {
      return;
    }
    switch(attrName) {
      case "text":
        this.shadowRoot.querySelector("#text").textContent = newVal;
        break;
      default:
        break;
    }
  }
  adoptedCallback() {
  }
  dismissCallback() {
    // needs override
    console.info("dismissed");
  }
}
