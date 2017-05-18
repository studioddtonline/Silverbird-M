class SilMQuoteTweetURL extends SilMElementWithDismiss {
  dismissCallback() {
    this.setAttribute("text", "");
    Composer.quoteTweetUrl = null;
    Composer.textareaChanged();
  }
}
customElements.define("silm-quotetweeturl", SilMQuoteTweetURL);
