class SilMLoadingIcon extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host {
        }
        #loading {
          width: 16px;
          height: 16px;
          display: none;
          animation: rotate 2s;
          animation-iteration-count: infinite;
          transform-origin: 6.6px 7.4px;
        }
        #loading.visible {
          display: block;
        }
        @keyframes rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
      <span id="loading" class="glyphicon glyphicon-repeat"></span>
    `;
    Object.defineProperties(this, {
      "visible": {
        get: () => {
          return this.icon.classList.contains("visible");
        }
      },
      "icon": {
        value: this.shadowRoot.querySelector("#loading")
      }
    });
  }
  connectedCallback() {
    // event binding
    if(!this.handleLoading && !!window) {
      this.handleLoading = (event) => {
        requestIdleCallback(() => {
          if(event.detail.state === true) {
            this.icon.classList.add("visible");
          } else if(event.detail.state === false) {
            this.icon.classList.remove("visible");
          } else {
            throw new TypeError("uncaught state");
          }
        });
      };
      window.addEventListener("loading", this.handleLoading);
    }
  }
  disconnectedCallback() {
    // event unbinding
    if(!!this.handleLoading && !!window) {
      window.removeEventListener("loading", this.handleLoading);
    }
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
}
customElements.define("silm-loadingicon", SilMLoadingIcon);
