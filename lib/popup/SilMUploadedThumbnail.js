class SilMUploadedThumbnail extends SilMElementWithDismiss {
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        @import "./css/silm_reset.css";
        :host,
        :host([src]) {
          display: none;
          width: 24px;
          height: 24px;
          font-size: .8em;
          overflow: hidden;
        }
        :host(:not([src=""])) {
          display: flex;
          flex-flow: row nowrap;
          align-items: center;
        }
        :host(:not([src=""])) img {
          width: 24px;
          height: 24px;
          display: block;
        }
        :host(:not([src=""])) span {
          display: none;
        }
        :host(:not([src=""]):hover) span {
          margin-left: -24px;
          width: 24px;
          height: 24px;
          text-shadow: 1px 1px 0 white, -1px -1px white;
          display: block;
        }
        #dismiss {
          cursor: pointer;
        }
      </style>
      <img id="thumbnail" src="${this.getAttribute("src") || ""}" />
      <span class="material-icons" id="dismiss">cancel</span>
    `;
  }
  static get observedAttributes() {
    return ["src"];
  }
  attributeChangedCallback(attrName, oldVal, newVal) {
    if(!window || !this.isConnected) {
      return;
    }
    switch(attrName) {
      case "src":
        this.shadowRoot.querySelector("#thumbnail").src = newVal;
        break;
      default:
        break;
    }
  }
  dismissCallback() {
    const mediaId = this.getAttribute("mediaId");
    if(Composer.mediaIds.has(mediaId)) {
      Composer.mediaIds.delete(mediaId);
      tweetManager.composerData.mediaIds = Composer.mediaIds;
      Composer.textareaChanged();
    }
    this.parentNode.removeChild(this);
  }
  async shrinkImage(url = this.getAttribute("src")) {
    const shrinked = await new Promise((resolve, reject) => {
      const baseImage = new Image();
      const errorHandler = (event, image = baseImage) => {
        console.error(event);
        image.removeEventListener("load", successHandler, {once: true});
        reject("");
      };
      const successHandler = (event, image = baseImage) => {
        image.removeEventListener("error", errorHandler, {once: true});
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        const context2d = canvas.getContext("2d");
        context2d.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL());
      };
      baseImage.addEventListener("error", errorHandler, {once: true});
      baseImage.addEventListener("load", successHandler, {once: true});
      baseImage.src = url;
    });
    if(shrinked !== "") {
      this.setAttribute("src", shrinked);
      return shrinked;
    } else {
      throw new TypeError("shrink failed");
    }
  }
}
customElements.define("silm-uploadedthumbnail", SilMUploadedThumbnail);
