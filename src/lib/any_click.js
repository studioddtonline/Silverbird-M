class AnyClick {
  static clearEventListeners(targets = document.querySelectorAll(`.inner_timeline a`)) {
    if(!targets) {
      return;
    }
    if(!targets[Symbol.iterator]) {
      targets = [targets];
    }
    targets.forEach((anchor) => {
      if(!AnyClick.holder.has(anchor)) {
        return;
      }
      anchor.removeEventListener("contextmenu", AnyClick.block, {capture: true});
      anchor.removeEventListener("click", AnyClick.block, {capture: true});
      anchor.removeEventListener("auxclick", AnyClick.block, {capture: true});
      anchor.removeEventListener("mousedown", AnyClick.handlerMouseDown, {capture: true});
      anchor.removeEventListener("mouseup", AnyClick.handlerMouseUp, {once: true});
      AnyClick.holder.delete(anchor);
    });
  }
  static anyClick(el, clickCallback = new Function()) {
    if(!AnyClick.holder.has(el)) {
      AnyClick.holder.set(el, clickCallback);
      el.addEventListener("contextmenu", AnyClick.block, {capture: true});
      el.addEventListener("auxclick", AnyClick.block, {capture: true});
      el.addEventListener("click", AnyClick.block, {capture: true});
      el.addEventListener("mousedown", AnyClick.handlerMouseDown, {capture: true});
    }
  }
  static block(event) {
    event.preventDefault();
    event.stopPropagation();
  }
  static handlerMouseDown(event) {
    event.preventDefault();
    event.target.addEventListener("mouseup", AnyClick.handlerMouseUp, {once: true});
  }
  static handlerMouseUp(event) {
    event.preventDefault();
    event.isAlternateClick = (event.button === 1) || event.metaKey || event.ctrlKey;
    (AnyClick.holder.get(event.target))(event);
  }
};

// JQuery Helper
(function($) {
  if(!AnyClick.holder) {
    AnyClick.holder = new WeakMap();
  }
  $.fn.anyClick = function(callback) {
    return this.each(function() {
      AnyClick.anyClick(this, callback);
    });
  };
})(jQuery);
