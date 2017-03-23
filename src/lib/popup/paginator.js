var Paginator = {
  needsMore: false,
  firstPage: function() {
    this.needsMore = false;
  },
  nextPage: function() {
    this.needsMore = true;
    loadTimeline();
  }
};
