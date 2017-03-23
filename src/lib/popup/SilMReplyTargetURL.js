class SilMReplyTargetURL extends SilMElementWithDismiss {
  dismissCallback() {
    this.setAttribute("text", "");
    Composer.replyTargetUrl = null;
    Composer.textareaChanged();
  }
}
customElements.define("silm-replytargeturl", SilMReplyTargetURL);
