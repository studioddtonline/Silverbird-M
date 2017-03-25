class SilMQuoteTweetURL extends SilMTextWithDismiss {
  dismissCallback() {
    Composer.quoteTweetUrl = null;
    Composer.textareaChanged();
  }
}
customElements.define("silm-quotetweeturl", SilMQuoteTweetURL);
