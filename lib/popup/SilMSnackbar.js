class SilMSnackbar extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host {
          position: absolute;
          top: 100%;
          left: 0;
          width: calc(100% - 2px);
          max-height: 50%;
          overflow: hidden;
          z-index: 20000;
          display: flex;
          flex-flow: column nowrap;
          justify-content: center;
          background-color: #9999ff;

          transition-property: transform, opacity;
          transition-duration: 300ms;
          transition-timing-function: ease-out;
          transform: translateY(0px);
          opacity: 0;
        }
        :host > #snackbar_message {
          line-height: 0.9;
          max-height: max-content;
          margin: 12px;
          overflow: hidden;
          flex: 0 10 auto;
        }
        :host(.visible) {
          transition-property: transform, opacity;
          transition-duration: 300ms;
          transition-timing-function: ease-out;
          transform: translateY(-40px);
          opacity: 1;
        }
        :host(.info) {
          background-color: #99ff99;
        }
        :host(.info) > #snackbar_message {
          color: var(--main-font-color);
          text-shadow: 1px 1px 0 white, -1px -1px white;
        }
        :host(.warning) {
          background-color: #eeee55;
        }
        :host(.warning) > #snackbar_message {
          color: var(--main-font-color);
          text-shadow: 1px 1px 0 white, -1px -1px white;
        }
        :host(.error) {
          background-color: #ff3333;
        }
        :host(.error) > #snackbar_message {
          color: white;
          text-shadow: 1px 1px 0 #993333, -1px -1px #993333;
        }
      </style>
      <p id="snackbar_message"></p>
    `;
    Object.defineProperties(this, {
      "timer": {
        value: 0,
        writable: true
      },
      "queue": {
        value: []
      }
    });
  }
  connectedCallback() {
    doLocalization(this.shadowRoot.querySelectorAll(".i18n"));
    // event binding
    this.handleClickForClose = (event) => {
      this.classList.remove("visible");
      this.clearTimer();
    };
    this.handleClickForHold = (event) => {
      this.addEventListener("click", this.handleClickForClose, {once: true});
      this.clearTimer();
    };
    if(!this.handleTransitionend) {
      this.handleTransitionend = (event) => {
        if(event.propertyName === "transform") {
          if(!!this.classList.contains("visible")) {
            if(this.timer > 0) {
              this.clearTimer();
            }
            this.timer = setTimeout(() => {
              this.removeEventListener("click", this.handleClickForHold, {once: true});
              this.removeEventListener("click", this.handleClickForClose, {once: true});
              this.classList.remove("visible");
              this.clearTimer();
            }, 4000);
            this.addEventListener("click", this.handleClickForHold, {once: true});
          } else {
            this.removeEventListener("click", this.handleClickForHold, {once: true});
            this.removeEventListener("click", this.handleClickForClose, {once: true});
            this.setAttribute("class", "info");
            this.shadowRoot.querySelector("#snackbar_message").textContent = ""
            this.clearTimer();
            this.dequeue();
          }
        }
      };
      this.addEventListener("transitionend", this.handleTransitionend);
    }
  }
  disconnectedCallback() {
    // event unbinding
    if(!!this.handleTransitionend) {
      this.removeEventListener("transitionend", this.handleTransitionend);
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
  dequeue() {
    if(this.queue.length > 0 && this.timer === 0) {
      const entry = this.queue.shift();
      const message = (entry.message || "").trim();
      if(!message || message === "") {
        return this.dequeue();
      }
      this.shadowRoot.querySelector("#snackbar_message").textContent = message;
      this.timer = -1;
      requestIdleCallback(() => {
        const styles = this.shadowRoot.querySelector("style");
        for(let rule of styles.sheet.cssRules) {
          if(rule.selectorText === ":host(.visible)") {
            rule.style.transform = `translateY(-${this.offsetHeight}px)`;
          }
        }
        this.setAttribute("class", `${entry.type || "info"} visible`);
      });
    }
  }
  enqueue(entry) {
    if(!entry) {
      return;
    }
    this.queue.push(entry);
    if(!this.classList.contains("visible")) {
      this.dequeue();
    }
  }
  clearTimer() {
    clearTimeout(this.timer);
    this.timer = 0;
  }
}
customElements.define("silm-snackbar", SilMSnackbar);
