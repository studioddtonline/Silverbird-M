class SilMReplyTargetURL extends SilMTextWithDismiss {
  dismissCallback() {
    Composer.replyTargetUrl = null;
    Composer.textareaChanged();
  }
}
customElements.define("silm-replytargeturl", SilMReplyTargetURL);
