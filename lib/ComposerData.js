"use strict";
class ComposerData {
  constructor(context) {
    this.init();
    if(context) {
      this.sync(context);
    }
  }
  init() {
    this.saveMessage = "";
    this.isComposing = false;
    this.replyId = null;
    this.replyUser = null;
    this.mediaIds = new Map();
    this.quoteTweetUrl = null;
    Object.seal(this);
  }
  clear() {
    this.init();
  }
  sync(context) {
    for(let prop in context) {
      if(this.hasOwnProperty(prop)) {
        if(this[prop] !== context[prop]) {
          this[prop] = context[prop];
        }
      } else {
        throw new TypeError(`${prop} is not a member of ComposerData`);
      }
    }
  }
}
