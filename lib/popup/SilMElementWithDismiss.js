class SilMElementWithDismiss extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.handleDismissClick = (event) => {
      this.dismissCallback();
    };
    return Object.seal(this);
  }
  render() {
    this.shadowRoot.innerHTML = `
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
        #dismiss {
          cursor: pointer;
        }
      </style>
      <span class="material-icons" id="dismiss">cancel</span>
      <span id="text"></span>
    `;
  }
  connectedCallback() {
    this.render();
    // event binding
    this.shadowRoot.querySelector("#dismiss").addEventListener("click", this.handleDismissClick);
  }
  disconnectedCallback() {
    // event unbinding
    this.shadowRoot.querySelector("#dismiss").removeEventListener("click", this.handleDismissClick);
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
    this.setAttribute("text", "");
    console.info("dismissed");
  }
}
