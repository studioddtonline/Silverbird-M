class SilMUserIcon extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.io = new IntersectionObserver((changes) => {
      for(let change of changes) {
        if(change.intersectionRatio > 0) {
          this.fetchImage(this.getAttribute("src"));
          this.io.unobserve(this);
        }
      }
    }, {
      threshold: [0, 0.01],
      rootMargin: `10% 0px`
    });
    this.matchTwitterDomain = new RegExp(`^(:?https?://(?:\\w+\\.?)twi(?:tter|mg?)\\.com/|/img/?)`, "iu");
    this.defaultProfileImageURL = "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png";
    return Object.seal(this);
  }
  connectedCallback() {
    this.render();
    // event binding
    this.io.observe(this);
  }
  disconnectedCallback() {
    // event unbinding
    this.io.disconnect();
  }
  static get observedAttributes() {
    return [];
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
        :host {
          display: inline-flex;
        }
        :host,
        :host img {
          width: 48px;
          height: 48px;
          margin: 0;
          border: none;
          padding: 0;
        }
        :host(.retweeter),
        :host(.retweeter) img {
          width: 1.5em;
          height: 1.5em;
        }
        :host(.icon_small),
        :host(.icon_small) img {
          width: 24px;
          height: 24px;
        }
        :host(.icon_normal),
        :host(.icon_normal) img {
          width: 48px;
          height: 48px;
        }
        :host(.icon_large),
        :host(.icon_large) img {
          width: 73px;
          height: 73px;
        }
        :host(.icon_max),
        :host(.icon_max) img {
          width: 128px;
          height: 128px;
        }
      </style>
      <img />
    `;
  }
  fetchImage(url = this.defaultProfileImageURL) { //TODO use fetch
    const shadowIcon = this.shadowRoot.querySelector("img");
    const handleError = ((el) => {
      return (event) => {
        console.info(event);
        el.src = this.defaultProfileImageURL;
      };
    })(shadowIcon);
    const handleLoad = ((el) => {
      return (event) => {
        el.removeEventListener("error", handleError);
      };
    })(shadowIcon);
    shadowIcon.addEventListener("error", handleError);
    shadowIcon.addEventListener("load", handleLoad, {once: true});
    shadowIcon.src = this.matchTwitterDomain.test(url)? url: this.defaultProfileImageURL;
  }
}
customElements.define("silm-usericon", SilMUserIcon);
