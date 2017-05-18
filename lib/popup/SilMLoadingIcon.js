class SilMLoadingIcon extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.handleLoading = (event) => {
      requestIdleCallback(() => {
        this.display(event.detail.state);
      });
    };
    return Object.seal(this);
  }
  connectedCallback() {
    this.render();
    // event binding
    if(!!window) {
      window.addEventListener("loading", this.handleLoading);
    }
  }
  disconnectedCallback() {
    // event unbinding
    if(!!window) {
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
  get visible() {
    if(!!this.icon && this.icon.classList) {
      return this.icon.classList.contains("visible") || false;
    } else {
      throw new TypeError("missing icon");
    }
  }
  get icon() {
    if(!this.isConnected) {
      throw new TypeError("it is not connected yet");
    }
    return this.shadowRoot.querySelector("#loading");
  }
  render() {
    this.shadowRoot.innerHTML = `
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
  }
  display(state) {
    if(!!this.icon && this.icon.classList) {
      if(state === true) {
        this.icon.classList.add("visible");
      } else if(state === false) {
        this.icon.classList.remove("visible");
      } else {
        throw new TypeError("uncaught state");
      }
    } else {
      throw new TypeError("missing icon");
    }
  }
}
customElements.define("silm-loadingicon", SilMLoadingIcon);
