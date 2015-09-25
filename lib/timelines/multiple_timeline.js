"use strict";
class MultipleTweetsTimeline extends TweetsTimeline {
  constructor(timelineId, manager, template, timelineData, orderNumber) {
    super(timelineId, manager, template);
    this.timelineData = timelineData;
    this.orderNumber = parseInt(orderNumber, 10);
  }
  /* overridden */
  init() {
    if(this.timelineData) {
      this._changeData(this.timelineData);
    }
    this._baseInit();
  }
  /* overridden */
  remove() {
    var currentData = this.template.getUserData();
    if(!currentData) {
      currentData = [];
    }
    currentData.splice(this.orderNumber, 1);
    this.template.setUserData(currentData);
    if(currentData.length === 0) {
      this.template.setVisible(false);
    } else {
      var templateId = this.template.id, orderNumber = this.orderNumber;
      this.manager.eachTimeline(function(timeline) {
        if(timeline.template.id == templateId && timeline.orderNumber > orderNumber) {
          timeline.orderNumber -= 1;
        }
      }, true);
    }
    this.killTimeline();
    return true;
  }
}
