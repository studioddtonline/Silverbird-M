/*
$('#trigger').actionMenu({
  actions: [
    {
      name: 'Action 1',
      icon: 'img/action1.png', #optional
      action: function(event) { console.log('action 1 fired'); }
    },
    {
      name: 'Action 2',
      action: function(event) { console.log('action 2 fired'); }
    },
    {
      name: 'Action 3',
      action: function(event) {},
      second_level: true
    }
  ],
  parentContainer: '.selector'
});
*/
(function($) {
  let initialized = false;
  const holder = new WeakMap();

  $.fn.actionMenu = function(options) {
    $.actionMenu.init();
    return this.each(function() {
      if(!holder.has(this)) {
        holder.set(this, new $.actionMenu(this, options));
      }
      holder.get(this).setOptions(options);
    });
  };

  $.actionMenu = function(triggerEl, actionMenuOptions) {
    this.triggerEl = $(triggerEl);
    this.triggerEl.addClass("actionMenuCreated");
    this.actionMenuEl = $(document.createElement('div')).addClass('action_menu');
    this.close();
    this.firstRun = true;
    this.visible = false;
    this.lastDirection = null;
    this.optionsChanged = false;

    this.triggerEl.anyClick((event) => {
      this.showActionMenu(event);
    });
  };

  $.actionMenu.init = function() {
    if(initialized) {
      return;
    }
    initialized = true;
    document.addEventListener("mouseup", (event) => {
      const target = event.target;
      const active = $.actionMenu.getActive();
      if(!!active
      && active.triggerEl[0] !== target
      && active.actionMenuEl.find(".second_level_trigger")[0] !== target) {
        event.preventDefault();
        active.close();
      }
    }, {
      capture: true
    });
  };

  $.actionMenu.getActive = function() {
    if(!initialized) {
      return undefined;
    }
    const created = document.querySelectorAll(".actionMenuCreated");
    if(!created) {
      return undefined;
    }
    let result = undefined;
    created.forEach((entry) => {
      if(holder.has(entry)) {
        const am = holder.get(entry);
        if(am.visible) {
          result = am;
        }
      }
    });
    return result;
  };

  $.actionMenu.prototype = {
    close: function() {
      if(this.visible) {
        this.actionMenuEl.removeClass("show");
        this.visible = false;
      }
    },

    showActionMenu: function(event) {
      if(this.optionsChanged) {
        this.reloadOptions();
      }
      if(!this.options.showMenu(event) || this.visible) {
        this.close();
        return;
      }
      const active = $.actionMenu.getActive();
      if(active) {
        active.close();
      }
      if(this.firstRun) {
        const container = this.triggerEl.parents(this.options.parentContainer);
        container.append(this.actionMenuEl);
        this.firstRun = false;
      }
      var direction = this.repositionActions();
      this.actionMenuEl.addClass("show");
    },

    updateSecondLevelTrigger: function(direction) {
      var lastDirection = this.lastDirection;
      if(!direction) {
        direction = lastDirection;
      }
      const trigger = this.actionMenuEl.find(".second_level_trigger");
      if(this.secondLevelOpened) {
        if(direction == 'up') {
          trigger.html('&darr;');
        } else if(direction == 'down') {
          trigger.html('&uarr;');
        } else if(direction == 'right') {
          trigger.html('&larr;');
        } else if(direction == 'left') {
          trigger.html('&rarr;');
        }
      } else {
        if(direction == 'up') {
          trigger.html('&uarr;');
        } else if(direction == 'down') {
          trigger.html('&darr;');
        } else if(direction == 'right') {
          trigger.html('&rarr;');
        } else if(direction == 'left') {
          trigger.html('&larr;');
        }
      }
    },

    repositionActions: function() {
      this.updateVisibleActions();

      var triggerPos = this.triggerEl.offset();
      const container = this.triggerEl.parents(this.options.parentContainer);
      var containerPos = container.offset();
      triggerPos.top = (triggerPos.top - containerPos.top) + container.scrollTop();
      triggerPos.left = (triggerPos.left - containerPos.left) + container.scrollLeft();

      var triggerSize = {width: this.triggerEl.width(), height: this.triggerEl.height()};
      var windowSize = {width: container.width() + container.scrollLeft(), height: container.height() + container.scrollTop()};

      var availableSpaceRight = windowSize.width - (triggerPos.left + triggerSize.width);
      var availableSpaceLeft = triggerPos.left;
      var availableSpaceTop = triggerPos.top;
      var availableSpaceBottom = windowSize.height - (triggerPos.top + triggerSize.height);

      this.actionMenuEl.removeClass('vertical');
      if(this.lastDirection) {
        this.actionMenuEl.removeClass(this.lastDirection);
      }
      this.actionMenuEl.addClass('horizontal');
      var actionMenuSize = {width: this.actionMenuEl.width(), height: this.actionMenuEl.height()};
      var direction;

      if(triggerPos.top < container.scrollTop()) {
        this.actionMenuEl.removeClass('horizontal');
        this.actionMenuEl.addClass('vertical');
        direction = 'down';
      } else {
        if(availableSpaceRight > actionMenuSize.width && availableSpaceBottom > actionMenuSize.height) {
          direction = 'right';
        } else if(availableSpaceLeft > actionMenuSize.width && availableSpaceBottom > actionMenuSize.height) {
          direction = 'left';
        } else {
          // change orientation
          this.actionMenuEl.removeClass('horizontal');
          this.actionMenuEl.addClass('vertical');
          actionMenuSize = {width: this.actionMenuEl.width(), height: this.actionMenuEl.height()};
          if(availableSpaceBottom > actionMenuSize.height) {
            direction = 'down';
          } else {
            direction = 'up';
          }
        }
      }

      var x, y;
      switch(direction) {
        case 'right':
          x = triggerPos.left + triggerSize.width;
          y = triggerPos.top;
          break;
        case 'left':
          x = triggerPos.left - actionMenuSize.width;
          y = triggerPos.top;
          break;
        case 'up':
          x = triggerPos.left;
          y = triggerPos.top - actionMenuSize.height;
          break;
        case 'down':
          x = triggerPos.left;
          y = triggerPos.top + triggerSize.height;
          break;
        default:
          // bug
          break;
      }

      // For up menus we have to reverse the order of the dom elements.
      const actionAreaEl = this.actionMenuEl.find(".action_area");
      const balloon = this.actionMenuEl.find(".balloon");
      if(direction == 'up') {
        if(this.lastDirection != 'up') {
          balloon.insertAfter(actionAreaEl);
        }
      } else if(this.lastDirection == 'up') {
        balloon.insertBefore(actionAreaEl);
      }

      if(direction == 'right' || direction == 'down') {
        actionAreaEl.removeClass("inverted");
      } else {
        actionAreaEl.addClass("inverted");
      }

      this.updateSecondLevelTrigger(direction);

      this.lastDirection = direction;
      this.visible = true;
      this.actionMenuEl.css({left: x, top: y});
      this.actionMenuEl.addClass(direction);

      return direction;
    },

    updateVisibleActions: function() {
      this.options.actions.forEach((action, index) => {
        if(!!action.condition) {
          const showAction = action.condition() || false;
          const actionEl = this.actionMenuEl.find(".action").eq(index);
          if(showAction) {
            actionEl.removeClass("conditionFalse");
          } else {
            actionEl.addClass("conditionFalse");
          }
        }
      });
    },

    setOptions: function(options) {
      this.options = Object.assign((this.options || {}), options);
      this.optionsChanged = true;
      if(this.visible) {
        this.reloadOptions();
        this.repositionActions();
      }
    },

    reloadOptions: function() {
      this.optionsChanged = false;
      this.secondLevelOpend = false;
      this.options.showMenu = this.options.showMenu || function() { return true; };
      const actions = this.options.actions || [];
      let actionHTML = "";
      actions.reduce((isSecondLevel, action) => {
        let classes = !!action.second_level? `action second_level second_level_hidden`: `action`;
        let output = `
          <div class="${classes}">
            ${!!action.icon? `<img src="${action.icon}" title="action.name" />`: `<a href="#">${action.name}</a>`}
          </div>
        `;
        if(!isSecondLevel && output.includes("second_level")) {
          actionHTML += `<div class="second_level_trigger"></div>${output}`;
          return true;
        } else {
          actionHTML += `${output}`;
          return isSecondLevel;
        }
      }, false);
      this.actionMenuEl.empty().html(`
        <div class="balloon"></div>
        <div class="action_area">
          ${actionHTML}
        </div>
      `);
      this.actionMenuEl.find(".action > *").each((index, entry) => {
        $(entry).anyClick((event) => {
          actions[index].action(event);
        });
      });
      this.actionMenuEl.find(".second_level_trigger").anyClick(() => {
        const secondLevelActions = this.actionMenuEl.find(".second_level");
        if(this.secondLevelOpend === true) {
          secondLevelActions.addClass('second_level_hidden');
          this.secondLevelOpend = false;
        } else if(this.secondLevelOpend === false) {
          secondLevelActions.removeClass('second_level_hidden');
          this.secondLevelOpend = true;
        }
        this.repositionActions();
      });
    }
  };
})(jQuery);
