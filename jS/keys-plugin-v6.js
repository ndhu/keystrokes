

(function ($, window, document, undefined) {

   window.requestAnimFrame = (function(){
          return  window.requestAnimationFrame       || 
                  window.webkitRequestAnimationFrame || 
                  window.mozRequestAnimationFrame    || 
                  window.oRequestAnimationFrame      || 
                  window.msRequestAnimationFrame     || 
                  function( callback ){
                    window.setTimeout(callback, 1000 / 60);
                  };
        })();

  var AHKeys = (function() {

        var Sequencer = function (seq, interval, delay, onTickHandler, holder, name)  {

          this.name = name;
          this.sequence = seq;
          this.ptr = 0;
          this.delay = delay;
          this.interval = interval;
          this.running = false;
          this.then = 0;
          this.tickHandler = onTickHandler;
          this.holder = holder;
          
          //make this available as that in the closure
          var that = this;
          
          this.update = function () {
            var now = Date.now();
            if (now - that.then > that.interval) {
              that.then = now;
              if(that.tickHandler) {
                if(that.ptr >= that.sequence.length) {
                  that.ptr = 0;
                }
                //console.log("thickhandler in " + that.name);
                that.tickHandler(that.sequence[that.ptr++], that.holder);
              }
            }
            if (that.running) {
              requestAnimFrame(that.update);
            }
          };
        
      };

      Sequencer.prototype.start = function () {
          this.running = true;
          this.then = Date.now();
          requestAnimFrame(this.update);
      };

      Sequencer.prototype.stop = function () {
        this.running = false
      };

      Sequencer.prototype.resume = function () {
        this.start();
      }

      Sequencer.prototype.reset = function() {
        this.prt = 0;
      }

      var KeyWrapper = function(code, string, placeholder, cssClass) {
        this.code = code;
        this.str = string;
        this.placeholder = placeholder;
        this.cssClass = cssClass || 'key';
        this.html = "<span class='key " + this.cssClass + "'>" + unescape(this.str) + "</span>";
        this.references = [];
      };

      KeyWrapper.prototype.addReference = function (elem) {
        this.references.push(elem);
      };

      KeyWrapper.prototype.getReferences = function() {
        return this.references;
      };

      var KeyMapper = function() {
        this.codeToWrapper = [];
        this.stringToWrapper = [];
        this.placeholderToWrapper = [];
      };

      KeyMapper.prototype.put = function(keyWrapper) {
        var code = keyWrapper.code,
            str = keyWrapper.str,
            placeholder = keyWrapper.placeholder;
        if(!this.codeToWrapper[code]) {
          this.codeToWrapper[code] = keyWrapper;
        }

        if(!this.stringToWrapper[str]) {
          this.stringToWrapper[str] = keyWrapper;
        } 

        if(!this.placeholderToWrapper[placeholder]) {
          this.placeholderToWrapper[placeholder] = keyWrapper;
        }
      };

      KeyMapper.prototype.getViaCode = function(code) {
        return this.codeToWrapper[code];
      };

      KeyMapper.prototype.getViaString = function(str) {
        return this.stringToWrapper[str];
      };

      KeyMapper.prototype.getViaPlaceholder = function(placeholder) {
        return this.placeholderToWrapper[placeholder];
      };

      var Part = function(start, end, hit, type, placeholder) {
        this.start = start;
        this.end = end;
        this.hit = hit;
        this.type = type;
        this.placeholder;
      }

      /*
       * Parses the string based on several regexp
       * stores the order and rebuilds the order
       * Treats whitespaces (in plain text entry and outside)
       * The result is an array of items that hold start and end
       * index of a hit, the hit itself, and the type of hit
       * (i.e. 'whitespace', 'plain', 'control', chars)
       */
      var parseString = function(str, regexps) {
        var str = str,
            orig = str,
            hitGroups = [],
            sortedGroups = [],
            whitespaces = [],
            whitespacesToKeep = [],
            plains = [],
            i = 0,
            pe,
            result = [];

        /*
         * We will need to compare the hits based on their statrting
         * index. Provides a compare functon to do so
         */
        var compare = function compare(a, b)
        {
          if (a.start < b.start)
             return -1;
          if (a.start > b.start)
             return 1;
          return 0;
        };

        /*
         * Based on the kind of hits we have 'whitespace' vs the rest
         * the hits are included in specific arrays
         */
        var addHits = function(targetArray, hits, type, reduce) {
          var from = 0;
          for (var k = 0; k < hits.length; k++) {
            hit = hits[k];
            start = orig.indexOf(hit, from); // + (rk === 'whitespace' ? 1 : 0); //we want the match in the original string
            end = start + hit.length;
            from = end;
            if (reduce) {
              str = str.replace(hit, "");
            }
            targetArray.push(new Part(start, end, hit, type));
          }
          return targetArray;
        }

        /*
         * Loops over all the regexps to extract mathces (single chars or group of chars)
         * based on their type. The type is given by the name of the regexp (ie. 'whitespace', or 'plain')
         * All hits are stored in an array except whitespaces which needs to be treated differently.
         */
        var rk, regexp, hits = [], hit, start, end, i = 0;
        for (rk in regexps) {
          regexp = regexps[rk];
          hits = str.match(regexp);
          if(hits) {
            if(rk !== 'whitespace') {
              hitGroups = addHits(hitGroups, hits, rk, true);
            } else {
              whitespaces = addHits(whitespaces, hits, rk, false);
            }
          }
        };

        //get plains
        plains = $.map(hitGroups, function(value, index) {
          if (value.type === 'plain') {
            return value;
          } 
          return null;
        });

        //get whitespaces that are not part of a plain text entry
        //the whitespsces inside plain text are matched already.
        //we do not want duplicates
        whitespacesToKeep = $.map(whitespaces, function(value, index) {
          for (i = 0; i < plains.length; i++) {
            pe = plains[i];
            if (pe.start < value.start && pe.end > value.end) {
              return null;
            }
          }
          return value;
        });

        //add the whitespaces we care to the hitgroup
        hitGroups = hitGroups.concat(whitespacesToKeep);

        //restore order of the items
        sortedGroups = hitGroups.sort(compare);
        return sortedGroups;
      };

    // our plugin constructor
      var Keys = function( elem, options ){
        this.elem = elem;
        this.$elem = $(elem);
        this.options = options;
        this.mapper = new KeyMapper();
        this.sequencers = [];
        this.parts = []; //all the parts (key items) that make up this Keys(Sequence)
        // This next line takes advantage of HTML5 data attributes
        // to support customization of the Keys on a per-element
        // basis. For example,
        // <div class=item' data-Keys-options='{"message":"Goodbye World!"}'></div>
        this.metadata = this.$elem.data('keyStack', []);
        return this;
      };

      // the Keys prototype
      Keys.prototype = {

        /*
         * regepxs to extract the types of keys (and groups)
         * the order of the regexps is important.
         */
        regexps: {
          whitespace: /\s/g,
          plain: /{([^\[\]\#\{\}_]*)}/g,
          controls: /./, /* will be built; /(\[ENTER\]|\[LEFT\]|\[UP\]|\[RIGHT\]|\[DOWN\])/g; /* /\[([A-Za-z]*)\]/g, */
          chars: /([^\[\]\s\#_])/g
        },

        init: function() {
          var i, s, that = this;
          // Introduce defaults that can be extended either
          // globally or using an object literal.
          this.config = $.extend({}, this.defaults, this.options, this.metadata);
          this.$elem.data('keyStack', []);

          for (i = 0; i <= 255; i++) {
            //Unicode
            s = String.fromCharCode(i);
            this.mapper.put(new KeyWrapper(i, s, s));
          }

          //cache control keys
          var controlKeys = [new KeyWrapper(13, 'ENTER', '[ENTER]', 'enter'),
                            new KeyWrapper(37, '%u2190', '[LEFT]', 'cursor'),
                            new KeyWrapper(38, '%u2191', '[UP]', 'cursor'),
                            new KeyWrapper(39, '%u2192', '[RIGHT]', 'cursor'),
                            new KeyWrapper(40, '%u2193', '[DOWN]', 'cursor'),
                            new KeyWrapper(27, 'ESC', '[ESC]', 'esc'),
                            new KeyWrapper(32, 'SPACE', '[SPACE]', 'space'),
                            new KeyWrapper(10, 'LINE FEED', '[LINEFEED]', 'line-feed'),
                            new KeyWrapper(127, 'DEL', '[DEL]', 'del'),
                            new KeyWrapper(9, 'TAB', '[TAB]', 'tab'),
                            new KeyWrapper(80, 'CTRL', '[CTRL]', 'ctrl'), //use upper half byte for ctrl
                            new KeyWrapper(81, 'SHIFT', '[SHIFT]', 'shift'), //use upper half byte for shift
                            new KeyWrapper(82, 'ALT', '[ALT]', 'alt'), //use upper half byte for alt
                            new KeyWrapper(82, 'CPSLK', '[CAPSLOCK]', 'capslock'), //use upper half byte for alt
                            new KeyWrapper(8, '%u21D0', '[BACKSPACE]', 'backspace')];

           //build regexp for control keys and store control keys in the mapper
          controlKeysRegexp = "(";
          $(controlKeys).each(function (i, item) {
            that.mapper.put(item);
            var ir = item.placeholder.replace(/^\[(\w*)\]$/i, "\\[$1\\]|");
            controlKeysRegexp += ir;
          });

          //this.regexps.all = "(" + controlKeysRegexp.replace(/\|$/, ")") + "|([^\\[\\]\s\#_])|{([^\\[\\]\#_]*)})";
          //this.regexps.all = new RegExp(this.regexps.all, "ig");
          this.regexps.controls = new RegExp(controlKeysRegexp.replace(/\|$/, ")"), "ig");
          console.log(controlKeysRegexp);


          this.bind();
          return this;
      },

      of: function(str) {
        var that = this,
            html,
            i,
            pass = "",
            part,
            ph,
            parts,
            regexps = this.regexps;
  
        this.parts = parts = parseString(str, regexps);;

        for (i = 0; i < parts.length; i++) {
          part = parts[i];
          if (part.type === 'whitespace') {
            ph = "<span class='gap' ></span>";
            part.placeholder = ph;
            pass += ph;
          } else if (part.type === 'plain') {
            ph = part.hit;
            ph = ph.replace('{', '');
            ph = ph.replace('}', '');
            part.placeholder = ph;
            pass += ph;
          } else {
            ph = this.mapper.getViaPlaceholder(part.hit);
            part.placeholder = ph;
            pass += (ph ? ph.html : "");
          }
        }

        this.$elem.append(pass);
        return that;
      },

      play: function(seq, interval, delay) {
        var that = this,
            allKeys = $('.key', that.$elem);
        var activate = (function() {
          var c0, c1, s;
          var onTickHandler = function (e, holder) {
            var k = allKeys[e];
            $(k).addClass('down');
            if(c0) {
              $(c0).removeClass('down');
            }
            c0 = k;
          };

          s = new Sequencer(seq, interval || 250, delay || 0, onTickHandler, that.$elem, that.$elem.attr('class'));
          s.start();

        })();
        return that;
      },

      hold: function(seq) {
         var that = this,
            allKeys = $('.key', that.$elem),
            i;
          for(i = 0; i < seq.length; i++) {
            $(allKeys[seq[i]]).addClass("down");
          }
          return that;
      },

      getWrapper: function(c) {
         wrapper = this.mapper.getViaString(c.toUpperCase());
          if (!wrapper) {
            code = escape(c);
            wrapper = this.mapper.getViaString(code);
          }
          return wrapper;
      },

      allParts: function() {
        return this.parts;
      },

      elements: function() {
        return $('.key', this.$elem);
      },

      bind: function() {
        var ks = this.metadata.data('keyStack'),
          mi = -1,
          that = this;
        $(window).on('keydown.Keys', function(event) {
          var wrapper, refs;
          if((mi = $.inArray(event.which, ks)) === -1) {
            ks.push(event.which);
            wrapper = that.mapper.getViaCode(event.which);
            refs = wrapper.getReferences();
            $(refs).each(function() {
              $(this).addClass('down');
            })
          }
          console.log(ks);
        }).on('keyup.Keys', function(event) {
          if ((mi = $.inArray(event.which, ks)) >= 0) {
            ks.splice(mi);
          }
          console.log(ks);
        });
      },

      
    }

    var setup = function (name, holder) {
      return new Keys(name, holder).init();
    }

    return {
      setup: setup
    }

  })();

  window.AHKeys = AHKeys;

})(jQuery, window, document);