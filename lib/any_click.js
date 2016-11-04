const AnyClick = {
  clearEventListeners: () => {
    const targets = document.querySelectorAll(`.inner_timeline a`);
    if(!targets) {
      return;
    }
    targets.forEach((anchor) => {
      if(!anchor.anyClick) {
        return;
      }
      anchor.removeEventListener("contextmenu", anchor.anyClick.clickBlock, {capture: true});
      anchor.removeEventListener("click", anchor.anyClick.clickBlock, {capture: true});
      anchor.removeEventListener("auxclick", anchor.anyClick.clickBlock, {capture: true});
      anchor.removeEventListener("mousedown", anchor.anyClick.handlerMouseDown, {capture: true});
      anchor.anyClick.handlerMouseDown = null;
      anchor.anyClick.handlerMouseUp = null;
      anchor.anyClick = null;
    });
  },
  anyClick: function(el, clickCallback = new Function()) {
    if(!el.anyClick) {
      el.anyClick = {
        callback: clickCallback,
        clickBlock: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        handlerMouseDown: (event, self = el) => {
          event.preventDefault();
          event.target.addEventListener("mouseup", self.anyClick.handlerMouseUp);
        },
        handlerMouseUp: (event, self = el) => {
          event.preventDefault();
          event.target.removeEventListener("mouseup", self.anyClick.handlerMouseUp);
          event.isAlternateClick = (event.button === 1) || event.metaKey || event.ctrlKey;
          self.anyClick.callback(event);
        }
      };
      el.addEventListener("contextmenu", el.anyClick.clickBlock, {capture: true});
      el.addEventListener("click", el.anyClick.clickBlock, {capture: true});
      el.addEventListener("auxclick", el.anyClick.clickBlock, {capture: true});
      el.addEventListener("mousedown", el.anyClick.handlerMouseDown, {capture: true});
    }
  }
};

// JQuery Helper
(function($) {
  $.fn.anyClick = function(callback) {
    return this.each(function() {
      AnyClick.anyClick(this, callback);
    });
  };
})(jQuery);
