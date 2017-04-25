(function($) {
  const singletonHolder = new WeakMap();
  const selectElementHolder = new WeakMap();
  const visibleElementHolder = new WeakMap();

  $.fn.simpleSelect = function(options) {
    return this.each(function() {
      if(!singletonHolder.has(this)) {
        singletonHolder.set(this, new $.simpleSelect(this, options));
      }
      return singletonHolder.get(this);
    });
  };

  $.simpleSelect = function(selectEl, simpleSelectOptions) {
    if(selectEl.tagName !== "SELECT") {
      return;
    }
    if(visibleElementHolder.has(this)) {
      visibleElementHolder.get(this).remove();
      visibleElementHolder.delete(this);
    }
    this.changeCallback = simpleSelectOptions.change;
    selectElementHolder.set(this, selectEl);
    selectEl.className = 'ss_overriden';
    // build html
    const options = Array.prototype.slice.call(selectEl.options);
    let optionAreaLists = ``;
    let visbleLabel = ``;
    for(let [index, option] of options.entries()) {
      let selected = "";
      if(index === selectEl.selectedIndex) {
        selected = ` class="selected"`;
        visibleLabel = `<span class="labelText">${option.text}</span>`;
      }
      optionAreaLists += `<li${selected}>${option.text}</li>`;
    }
    const visibleHtml = `
      <div class="simple_select">
        <span class="label">
          ${visibleLabel}
          <img src="img/arrow_down.gif">
        </span>
        <div class="options_area">
          <ul>
            ${optionAreaLists}
          </ul>
        </div>
      </div>
    `;
    const $visibleHtml = $(visibleHtml);
    $visibleHtml.insertBefore(selectEl);
    requestIdleCallback(() => {
      visibleElementHolder.set(this, $visibleHtml);
      this.initializeEvents();
    });
  };

  $.simpleSelect.prototype = {
    initializeEvents: function() {
      const visibleEl = visibleElementHolder.get(this);
      const imgEl = visibleEl.find("img");
      const optionsArea = visibleEl.find(".options_area");
      const menuEl = optionsArea.find("li");
      menuEl.click((event) => {
        this.selectElement($(event.target).index(), true);
      });
      imgEl.click((event) => {
        optionsArea.toggle();
      });
      $(document).click((event) => {
        if(event.target !== imgEl[0]) {
          optionsArea.hide();
        }
      });
      $('.ui-tabs-nav li a').click((event) => {
        if(event.target === visibleEl.find(".labelText")[0]) {
          optionsArea.hide();
        }
      });
    },

    selectElement: function(index, generateEvent) {
      const selectEl = selectElementHolder.get(this);
      const visibleEl = visibleElementHolder.get(this);
      const optionsArea = visibleEl.find(".options_area");
      if(generateEvent && this.changeCallback) {
        const optionEl = selectEl.options[index];
        const shouldSelect = this.changeCallback(JSON.parse(unescape(optionEl.dataset.list)));
        if(!shouldSelect) {
          return;
        }
        optionsArea.toggle();
        optionsArea.find(".selected").removeAttr("class");
      }
      const liEl = optionsArea.find("li").eq(index);
      liEl.addClass("selected");
      selectEl.selectedIndex = index;
      visibleEl.find(".labelText").text(liEl.text());
    }
  };
})(jQuery);
