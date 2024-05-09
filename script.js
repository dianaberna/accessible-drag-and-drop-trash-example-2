/*
DragAct v1.02 [20231218]

AUTHOR:     James Edwards (TPGi)
COPYRIGHT:  © 2023 TPGi <https://www.tpgi.com/>
LICENSE:    https://creativecommons.org/licenses/by-sa/4.0/
*/
export default class DragAct {

    //key names we respond to from keyboard events
    //nb. it feels safer to define Space as ("\u0020") rather than its literal keyname (" ")
    static #keynames = ['arrowup','arrowright','arrowdown','arrowleft','pageup','pagedown','home','end','\u0020','x','a','enter','v','s','escape'];

    //default language data for accessible descriptions
    //along with a public getter that returns a readonly copy
    //nb. each member is a dictionary of strings indexed by BCP47 language code
    static #language = {
        'en' : {
            'role-description'  : '{{role}} drag and drop',
            'selection-notes'   : 'To choose items press Space.',
            'empty-notes'       : 'No items.',
            'drop-notes'        : 'To drop items press Enter.',
            'sort-notes'        : 'Sort by chosen order.',
            'sort-number'       : '#{{number}}',
            'selected-items'    : '{{count}} {{items}} checked.',
            'dropped-items'     : '{{count}} {{items}} dropped.',
            'item-single'       : 'item',
            'item-plural'       : 'items'
        },
        'it' : {
            'role-description'  : '{{role}} drag and drop',
            'selection-notes'   : 'Per scegliere l elemento premere Barra Spaziatrice.',
            'empty-notes'       : 'Non ci sono definizioni.',
            'drop-notes'        : 'Per rilasciare l elemento selezionato premere Invio',
            'sort-notes'        : 'Riordina scegliendo l ordine',
            'sort-number'       : '#{{number}}',
            'selected-items'    : '{{count}} {{items}} selezionate.',
            'dropped-items'     : '{{count}} {{items}} spostate.',
            'item-single'       : 'elemento',
            'item-plural'       : 'elementi'
        }
    };
    static get language() {
        return { ...this.#language }
    }

    //default language code and expected keys for validation
    static #langdefault = Object.keys(this.#language).shift();
    static #langkeys = [ ...Object.keys(this.#language[this.#langdefault]) ];

    //compile a throwable exception
    static #exception(message, type  = 'Error') {
        let error = new window[type]();
        error.name = `${this.name} ${type}`;
        error.message = `${message}\n`;
        return error;
    }

    //define additional language data (or re-define the default)
    //nb. this is kinda over-engineered validation for such simple data
    //but since all the language is for non-visible screen reader output,
    //and not everyone actually tests with a screen reader, there can't be
    //any possibility of invalid input, because the author might not notice
    static i18n(lang) {
        for(let [ code, strings ] of Object.entries(lang)) {

            //throw an exception if the code is empty
            if(!code.trim()) {
                throw(this.#exception(`The language code "${code}" is not valid.`, 'TypeError'));
            }

            //remove and ignore any unexpected data by key validation
            strings = Object.fromEntries(Object.entries(strings).filter((entry) => {
                return this.#langkeys.includes(entry[0]);
            }));

            //throw an exception if any of the expected keys are missing
            const keys = Object.keys(strings);
            const missing = this.#langkeys.filter((expected) => !keys.includes(expected));
            if(missing.length) {
                throw(this.#exception(`The language data for "${code}" is missing expected values (\"${missing.join('\",\"')}\").`, 'TypeError'));
            }

            //throw an exception if any of the values are not valid strings
            //nb. this includes rejecting empty or whitespace-only strings
            //but doesn't trim whitespace from any otherwise valid strings
            const invalid = keys.filter((key) => {
                return !(typeof(strings[key]) == 'string' && strings[key].trim());
            });
            if(invalid.length) {
                throw(this.#exception(`The language data for "${code}" contains invalid or empty values (\"${invalid.join('\",\"')}\").`, 'TypeError'));
            }

            //throw an exception if parsing tokens aren't present
            const notokens = keys.filter((key) => {
                switch(true) {

                    case (key == 'role-description') :
                        return (strings[key].indexOf('{{role}}') < 0);

                    case (key == 'sort-number') :
                        return (strings[key].indexOf('{{number}}') < 0);

                    case !(key == 'selected-items' || key == 'dropped-items') :
                        return false;

                    default :
                        return (strings[key].indexOf('{{count}}') < 0 || strings[key].indexOf('{{items}}') < 0);
                }
            });
            if(notokens.length) {
                throw(this.#exception(`The language data for "${code}" is missing expected tokens (\"${notokens.join('\",\"')}\").`, 'SyntaxError'));
            }

            //save this data to the language object using the specified code
            //nb. convert the code to lower-case because BCP47 is case-insensitive
            this.#language[code.toLowerCase()] = { ...strings };
        }
    }

    //get the closest matching code in available language data
    //from a list of wanted codes in order of precedence
    static #getLanguageMatch(want, have) {

        //okay so ... this is kinda complicated ... we need to be able to match
        //any specified language against the closest matching language we have
        //but it gets messy when languages are specified with multiple subcodes
        //some cases are simple, like if we want "en-us" and we only have "en"
        //then that should be returned, and also the reverse of that, however
        //if we want "fr-ca" and have ["fr-be","fr"] then we should return "fr"
        //because the base code is preferable to a non-matching subcode
        //similarly if we want "en-gb-cockney" and we have "en-us-fake-cockney"
        //then we should still return that as a potential match for the "en" base
        //so, how to do that ... it's taken me the whole day to figure it out lol

        //parse the language codes we have into deep arrays of matchable subcodes
        //eg. "en-gb-cockney" would be parsed into ["en-gb-cockney","en-gb","en"]
        let havecodes = have.map((havecode) => this.#getSubcodes(havecode));

        //now compile an array of scores for each code we want in order of precedence
        //where each member returns an object that specifies the language we wanted,
        //the closest matching language we have, and a score for how closely it matches
        //eg.  { want : "en-gb-cockney", have : "en-us-fake-cockney", score : 2 }
        let matches = want.map((code) => {

            //parse the codes for this precedent into an array of matchable subcodes
            //then map that to create an array of sets of scores, which is a matrix
            //of all the matchable subcodes in this precedent, each one scored against
            //all the matchable subcodes in each of the languages we have data for (ikr)
            //sorted in order of highest score, then in inverse order of subcode length
            //(that latter part being how we give preference to base code matching)
            //which eventually returns just the highest match for each original precedent
            let subcodes = this.#getSubcodes(code);

            let scoresets = subcodes.map((subcode) => {

                let scores = this.#doScoreSort(havecodes.map((havesubcodes) => {

                    let scores = this.#doScoreSort(havesubcodes.map((havesubcode) => {

                        let score = subcode.includes(havesubcode) ? havesubcode.length : 0;
                        let have = havesubcode;

                        return { score, have };
                    }));

                    let score = (scores.length ? scores[0].score : 0);
                    let have = havesubcodes[0];

                    return { score, have };
                }));

                return { subcode, scores };
            });

            //since the scoresets are in order of precedence, we only need to keep
            //the first one that scored more than zero, or the first one that
            //scored zero if none of them scored higher, which in either case
            //is the first once, since we sorted the arrays by score as we went along
            //then return that, indexed by the code we originally wanted
            let match = scoresets[0].scores[0];
            let want = code;

            return { want, ...match };
        });

        //filter to remove any zero-scoring entries
        //nb. we had to keep them up until now to maintain the "have" references
        //otherwise we could lose track of them during havecodes.map iteration
        //when havesubcodes[0] would be undefined if havesubcodes.map scored zero
        matches = matches.filter(match => match.score);

        //return the language code for the highest scoring match
        //or return the default if we didn't find any matches
        return matches.length ? matches[0].have : this.#langdefault;
    }

    //parse a language code into an array of matchable subcodes
    //eg. "en-gb-cockney" would return ["en-gb-cockney","en-gb","en"]
    static #getSubcodes(code) {
        let subcodes = [ code ];
        while(code) {
            subcodes.push(code = code.split('-').slice(0, -1).join('-'));
        }
        return subcodes.slice(0, -1);
    }

    //sort an array of subcode scores by highest score
    //nb. if two subcodes have the same score then sort them
    //by lowest string length, so that we match base codes
    //in preference to non-matching regional subcodes
    //eg. if we had ["fr","fr-be"] and wanted "fr-ca"
    //we would return "fr" in preference to "fr-be"
    //when they would otherwise have the same score
    //nb. if the string lengths are also the same then
    //stable sort is not guaranteed, but that doesn't matter
    //because the choice of those equivalents is arbitrary
    static #doScoreSort(scores) {
        return Array.from(scores).sort((a, b) => {
            if(b.score == a.score) {
                return a.have.length - b.have.length;
            }
            return b.score - a.score;
        });
    }

    //tokenized format and counters for dynamic IDs
    //including a static private method for creating them
    //nb. this is needed for IDREFS like aria-activedescendant
    //although activedescendant can use implicit owning relationships
    //that requires the items to be direct children of the droptargets
    //which wouldn't allow flexibility for different markup structures
    static #idformat = 'drag-act-{{index}}-{{type}}-{{counter}}';
    static #indexes = 0;
    #index = 0;
    #counter = 0;

    static #getID(params) {
        let id = this.#idformat;
        for(let [ key, value ] of Object.entries(params)) {
            id = id.replace(`\{\{${key}\}\}`, value);
        }
        return id;
    }

    //reference to whichever instance is currently dragging
    //nb. we need this because most of the drag events have to be
    //bound to the whole document, so each instance will bind its own,
    //and if we don't filter them by instance then we'll get things like
    //the dragover effect showing on containers from different instances
    //or reference errors when trying to move items between instances
    //not to mention that our preventDefaults would block other scripts
    //so we update this reference whenever items are selected
    //and then reset it again when the last item is unselected or dropped
    static #draginstance = null;

    //whether to apply hacks for Safari/VoiceOver
    //which can only be set before first instantation
    //nb. see instances of 'data-drag-safari' for info
    static #safarihacks = 0;
    static get safarihacks() {
        return this.#safarihacks;
    }
    static set safarihacks(flag) {
        if(this.#indexes) {
            throw(this.#exception('The safarihacks flag can only be set before creating instances.', 'TypeError'));
        }
        if(isNaN(flag = parseInt(flag, 10)) || flag < -1 || flag > 1) {
            throw(this.#exception('The safarihacks flag must an integer between -1 and 1.', 'RangeError'));
        }
        this.#safarihacks = flag;
    }


    //---//


    //scope element reference (null until we have one)
    //along with a public getter that returns a shortcut reference
    #scope = null;
    get scope() {
        return this.#scope;
    }

    //default active language code, along with a public getter
    //that returns a readonly copy of the corresponding language data
    //nb. although the language data itself is static
    //so it can be defined before any instances are constructed
    //the active code is set for each instance, which allows them
    //to use different languages specified by scope "lang" attribute
    #langcode = this.constructor.#langdefault;
    get language() {
        return { ...this.constructor.#language[this.#langcode] };
    }

    //dictionary of all the relevant elements within this scope
    //including a public getter that returns a readonly shallow copy
    #collection = {};
    get collection() {
        return { ...this.#collection };
    }

    //dictionary of reference elements for aria-describedby
    //nb. it would be easier if we could use aria-description
    //but that's not widely supported enough just yet
    #describedby = {};

    //dictionary of current selection data
    //comprising an array of the currently selected items
    //node reference to those items' owner element
    //node reference to the current droptarget
    //flag for whether dropped items should be sorted
    //nb. sorting will append the items in their original node order
    //rather than appending them in the order they were selected
    //sorting is the default behavior, while not sorting can be
    //triggered by Ctrl/Cmd + S or by interacting with a sorted button
    //so for users, the "sort" action is actually not sorting lol
    #selection = {
        dragitems   : [],
        owner       : null,
        droptarget  : null,
        nodesort    : true
    };

    //array of callbacks bound to this instance
    //including a public method for binding them
    //and a private method for dispatching them
    //nb. callbacks are dispatched whenever a droptarget updates
    #callbacks = [];
    addCallback(fn) {
        this.#callbacks.push(fn);
    }
    #dispatchCallbacks() {
        this.#callbacks.forEach((fn) => fn.call(this));
    }

    //flag to identify touch-triggered mouse events
    //nb. touch interaction is mostly handled by simulated mouse events
    //so this is needed to implement unmodified multi-selection for touch users
    //without affecting the use of modifier states for mouse users
    #touching = false;

    //reference to the target of any mousedown event
    //nb. this is used as a filter when we handle relevant mouseup events
    //so we can ignore those events when the down and up targets don't match
    //this emulates the native behavior of things like buttons and checkboxes
    //and gives users a way to back out of an unintended pre-click mousedown
    #pointer = null;

    //reference to the target of the last dragenter event
    //nb. we need this to maintain the .dragover class (the drag hover state)
    //which is controlled from dragleave events (equivalent to container mouseout)
    //and for that we need to know which container is being dragged out of
    //however the dragleave event doesn't provide that information
    //seems odd really, that an event fired by dragging out of an element
    //doesn't actually tell you what element you're dragging out of
    //target points to where you're going, and relatedTarget is null
    //so what we can do instead is update this property from dragenter
    //and that will inevitably match the following dragleave's container
    #dragenter = null;

    //instance mutation observer
    //nb. this is used to detect external changes to the DOM
    //eg. if you append new draggable items after initialization
    //but we need a reference to that so we can dynamically disconnect
    //on selection, to stop it from responding to internal modifications
    //nb. this will only respond to adding or removing draggable items
    //ie. addition or removal of droptarget containers is not supported
    #observer = null;


    //---//


    //instance constructor
    constructor(scope = null) {

        //get the instance scope element or throw an exception if it's null
        //nb. the argument can be an element reference or a selector query
        //but if it's anything else then coerce it to a string first
        //which is the simplest way of handling any mistyped input
        //however that makes it necessary to try..catch the querySelector
        //since it throws an exception over invalid selector syntax
        if((scope || {}).nodeType !== 1) {
            try {
                scope = document.querySelector(String(scope));
            }
            catch(ex) {
                scope = null;
            }
        }
        if(!(this.#scope = scope)) {
            throw(this.constructor.#exception('The scope element reference is invalid.', 'ReferenceError'));
        }

        //look for declared or user language codes by order of precedence
        //nb. scope lang attributes take precedence over the document language
        //then the user language is used if neither of those are defined
        //or if we don't have any matching language for a higher precedent
        //this allows individual instances to use different languages
        //or variants of the same language via custom extensions (eg. "en-widget1")
        //and for whole-page translations to be applied, if available
        //nb. convert found codes to lower-case because BCP47 is case-insensitive
        let want = [
            this.#scope.getAttribute('lang'),
            document.documentElement.getAttribute('lang'),
            navigator.language

        ].map(code => (code || '').trim().toLowerCase()).filter(code => code);

        //get an array of all the codes we have language for
        //nb. stored language codes are already lower-cased
        let have = Object.keys(this.constructor.#language);

        //now define the instance language code with the closest match we have
        this.#langcode = this.constructor.#getLanguageMatch(want, have);

        //then set the matching language code on the scope lang attribute
        //nb. in case the existing value was a code we couldn't match
        //it has to be udpated to declare the language we're actually using
        this.#scope.setAttribute('lang', this.#langcode);

        //assign the current indexes counter then increment it
        //nb. this is so that each instance has a unique index
        //so there's no ID collision between multiple instances
        this.#index = this.constructor.#indexes ++;

        //get the list of droptargets inside this scope
        this.#scope.querySelectorAll('[data-drag-act="droptarget"]').forEach((droptarget) => {

            //assign a generated ID if it doesn't already have one
            //nb. we have to do this before initializing the droptargets
            //because we need their IDs for describedby references
            if(!droptarget.id) {
                droptarget.id = this.constructor.#getID({
                    index   : this.#index,
                    type    : 'droptarget',
                    counter : this.#counter ++
                });
            }

            //identify iOS and MacOS Safari to create an identifying attribute
            //unless the static safarihacks flag has been set to override this
            //either with -1 to turn it off entirely, or 1 to apply it for all
            //nb. we need this to fix a variety of issues with VoiceOver
            //see instances of 'data-drag-safari' for various details
            //nb. we have to assume that VO is being used with Safari
            //the fixes won't apply if it's used with any other browser
            //and will apply to vanilla Safari even without VoiceOver
            //since VO itself can't be directly identified or targetted
            if(this.constructor.#safarihacks >= 0) {
                if(this.constructor.#safarihacks || navigator.vendor == 'Apple Computer, Inc.') {
                    droptarget.setAttribute('data-drag-safari', ('ontouchstart' in document) ? 'ios' : 'macos');
                }
            }

            //create a pair of reference elements for aria-describedby
            //one for the droptarget itself, and one for all its items
            //and save their references to the describedby dictionary
            //nb. don't append them yet because we need the initial
            //state of the droptarget's DOM for container initialization
            //nb. elements referenced by aria-describedby don't have to be
            //present in the acctree, so they can be [hidden] or display:none
            //and that's really helpful here because it prevents any
            //possibility of them being read or copied independently
            //and doesn't rely on having to use visually-hidden styles
            //however ... we're going to be updating them on the fly,
            //and if they're empty at the point when the page loads (or ever)
            //then they stop being announced by JAWS/NVDA+Chrome/Edge
            //because they're permanently transmitted to the API with no description
            //<https://github.com/FreedomScientific/standards-support/issues/787>
            //so by default, and whenever the value is cleared, we use zero-width space
            //which counts as text content even though it's silent and invisible
            //and is trim-safe because it's not a unicode "white space character"
            this.#describedby[droptarget.id] = {};
            ['droptarget','dragitems'].forEach((key) => {

                let node = document.createElement('span');
                node.setAttribute('data-drag-act', 'description');
                node.setAttribute('hidden', '');
                node.textContent = '\u200b';

                node.id = this.constructor.#getID({
                    index   : this.#index,
                    type    : 'description',
                    counter : this.#counter ++
                });

                this.#describedby[droptarget.id][key] = node;
            });

            //if data-drag-state is not defined (or empty) default to "aria-checked"
            //nb. this allows for configurable selection states, eg. "aria-selected"
            //but it's the author's resonsibility to make sure they're compatible
            if(!droptarget.getAttribute('data-drag-state')) {
                droptarget.setAttribute('data-drag-state', 'aria-checked');
            }

            //if this is Safari, except for MacOS when the selection state is aria-selected,
            //then convert the dragitem describedby element to a live region
            //nb. since the description text is only updated when the user needs
            //to know, it has essentially the same behavior as a status region
            //re-announced by JAWS and NVDA because it co-occurs with a state change
            //however the dynamic re-announcement doesn't happen in VoiceOver
            //but we can largely emulate that behavior with a status region
            //however don't do that for aria-selected in MacOS because its VoiceOver
            //already has descriptions built-in for a change in the number of selections
            const safari = droptarget.getAttribute('data-drag-safari');
            if(safari && (safari == 'ios' || droptarget.getAttribute('data-drag-state') != 'aria-selected')) {
                this.#describedby[droptarget.id].dragitems.removeAttribute('hidden');
                this.#describedby[droptarget.id].dragitems.setAttribute('aria-live', 'polite');
            }

            //build the initial collection dictionary for this droptarget
            //while initializing the droptarget and all the dragitems inside it
            let dragitems = this.#getDroptarget(droptarget);
            this.#collection[droptarget.id] = {
                droptarget  : droptarget,
                dragitems   : dragitems,
                parent      : this.#getParent(droptarget, dragitems),
                label       : this.#getLabel(droptarget),
                sorted      : this.#getSorted(droptarget),
                multimode   : this.#getDefaultMultimode(droptarget, dragitems)
            };

            //now insert the reference elements at the start
            //nb. putting them at the end would mean they'd move around as items
            //are added to the droptarget, which doesn't technically matter,
            //but it makes it harder to debug, and it just feels kinda wrong
            droptarget.insertAdjacentElement('afterbegin', this.#describedby[droptarget.id].dragitems);
            droptarget.insertAdjacentElement('afterbegin', this.#describedby[droptarget.id].droptarget);

            //also associate the droptarget description element with the droptarget label
            //so that the instructions are announced when navigating directly to the heading
            //nb. this is particularly useful in iOS/VoiceOver, since it navigates containers
            //by their text content rather than the containers themselves, although it's a little
            //unfortunate that the instructions refer to keyboard commands like "... press Space"
            //however most users should be able to interpret that to mean double-tap
            //and it still gives useful info as to the available actions in each container
            //(and it will be applicable if the user is navigating with a bluetooth keyboard)
            this.#collection[droptarget.id].label.setAttribute('aria-describedby', this.#describedby[droptarget.id].droptarget.id);

            //apply accessible descriptions for the default selection state
            this.#describeDroptarget(droptarget, 'selection-notes');
        });

        //bind all events
        this.#bindAgnosticEvents();
        this.#bindPointerEvents();
        this.#bindDragEvents();
        this.#bindKeyboardEvents();
    }


    //---//


    //get an array of the dragitems inside a droptarget container
    //and optionally (re-)initialize with the necessary attributes
    #getDragitems(droptarget, init = false) {

        //get the collection of dragitem elements
        let dragitems = droptarget.querySelectorAll('[data-drag-act="dragitem"]');

        //if we're initializing this collection
        if(init) {
            for(const dragitem of dragitems) {

                //assign a generated ID if it doesn't already have one
                if(!dragitem.id) {
                    dragitem.id = this.constructor.#getID({
                        index   : this.#index,
                        type    : 'dragitem',
                        counter : this.#counter ++
                    });
                }

                //check the dragitem has a non-empty role, or throw an exception
                //nb. roles are essential for assistive tech so the lack of one
                //is significant enough to warrant a fatal exception
                if(!dragitem.getAttribute('role')) {
                    throw(this.constructor.#exception(`The dragitem "#${dragitem.id}" does not have an explicit role.`, 'TypeError'));
                }

                //make the dragitems draggable
                //and apply their default selection state
                dragitem.setAttribute('draggable', 'true');
                dragitem.setAttribute(droptarget.getAttribute('data-drag-state'), 'false');

                //set aria-describedby to its corresponding reference ID
                //unless this is Safari (VoiceOver) which doesn't support descriptions
                if(!droptarget.hasAttribute('data-drag-safari')) {
                    dragitem.setAttribute('aria-describedby', this.#describedby[droptarget.id].dragitems.id);
                }
            }
        }

        //return an array of the collection
        return Array.from(dragitems);
    };


    //initialize a single droptarget with the necessary attributes
    //then get its array of owned dragitems while initiailizing all of them
    //and setting activedescendant as specified by setdescendant, or default to the first one
    #getDroptarget(droptarget, setdescendant = null) {

        //check the droptarget has a non-empty role, or throw an exception
        //nb. roles are essential for assistive tech so the lack of one
        //is significant enough to warrant a fatal exception
        if(!droptarget.getAttribute('role')) {
            throw(this.constructor.#exception(`The droptarget "#${droptarget.id}" does not have an explicit role.`, 'TypeError'));
        }

        //check the droptarget has a declared label element, or throw an exception
        //nb. visible labels may be required by 3.3.2, and they provide better usability
        //especially for voice recognition since they can be spoken to initiate a drop action
        //and if headings are used, then they provide per-container navigation hooks
        //via headings navigation or down-swipe or whatever the user's AT has for that
        //which is particularly essential for iOS/VoiceOver since it can't navigate
        //to empty containers at all, so this provides a functional navigation hook
        //nb. if the context doesn't require a visible label then it can be visually hidden
        //but it mustn't be actually hidden or undisplayed because iOS/VO needs it
        //unless the use-case could guarantee that containers will never be empty
        //which it can't, because there's nothing to stop the user emptying one
        let label = this.#getLabel(droptarget);
        if(!label) {
            throw(this.constructor.#exception(`The droptarget "#${droptarget.id}" does not have a labelling element.`, 'ReferenceError'));
        }

        //assign a generated ID to the label if it doesn't already have one
        if(!label.id) {
            label.id = this.constructor.#getID({
                index   : this.#index,
                type    : 'label',
                counter : this.#counter ++
            });
        }

        //programmatically associate it with the droptarget and remove any aria-label
        //nb. just in case it was hard-coded, since it's redundant and maybe conflicting
        droptarget.setAttribute('aria-labelledby', label.id);
        droptarget.removeAttribute('aria-label');

        //add the droptarget to the tab order and apply the role description
        //and set aria-describedby to its corresponding reference ID
        //unless this is Safari (VoiceOver) which doesn't support descriptions
        //nb. the role description includes the original role as well
        //because screen reader users rely on recognising interaction patterns
        //based on the announced role, eg. arrow keys to navigate a listbox
        //and although JAWS and NVDA do announce available navigation keys
        //that's only at beginner verbosity levels, which most regular users
        //will have switched off because they already know what keys to use
        //so they just need to know what the container's functional role is
        droptarget.setAttribute('tabindex', '0');
        droptarget.setAttribute('aria-roledescription', this.#parseToken(this.language['role-description'], 'role', droptarget.getAttribute('role')));

        if(!droptarget.hasAttribute('data-drag-safari')) {
            droptarget.setAttribute('aria-describedby', this.#describedby[droptarget.id].droptarget.id);
        }

        //if the selection attribute is "aria-selected" then declare aria-multiselectable
        //nb. this is only valid and applicable if the items are aria-select-able
        //nb. multi-select behavior is already implied with aria-checked semantics
        if(droptarget.getAttribute('data-drag-state') == 'aria-selected') {
            droptarget.setAttribute('aria-multiselectable', 'true');
        }

        //remove any existing data-drag-valid attribute
        //nb. this is used to denote valid droptarget containers
        //where "true" means it is, and "false" means it's the owner
        //but removing it otherwise rather than defaulting to "false"
        //makes it much more useful as a CSS attribute selector:
        //  [data-drag-valid]           { items are selected (in any container, not necessarily this one) }
        //  :not([data-drag-valid])     { no items are selected (in any container) }
        //  [data-drag-valid="false"]   { this is the selection home container (items are selected in this container) }
        //  [data-drag-valid="true"]    { this is a valid droptarget (items are selected in another container) }
        droptarget.removeAttribute('data-drag-valid');

        //remove any tabindex from elements inside this droptarget
        //nb. just in case they were hard-coded, because that's a contradiction
        //when we're using aria-activedescendant to manage item navigation
        //only the droptarget elements themselves should be focusable
        for(const progeny of droptarget.querySelectorAll('*')) {
            progeny.removeAttribute('tabindex');
        }

        //get and initialize the dragitems inside this droptarget
        let dragitems = this.#getDragitems(droptarget, true);

        //if the droptarget is not empty
        if(dragitems.length) {

            //compile aria-owns from the dragitem IDs and clear .activedescendant
            let ids = [];
            for(const dragitem of dragitems) {
                ids.push(dragitem.id);
                dragitem.classList.remove('activedescendant');
            }
            droptarget.setAttribute('aria-owns', ids.join(' '));

            //set activedescendant to the specified dragitem, or default to the first one
            //also copying that to data-drag-lastdescendant so it has an initial value
            //nb. we need the lastdescendant to evaluate range selections
            //so that we always have two item references to define the boundaries
            const activedescendant = setdescendant || dragitems[0];
            droptarget.setAttribute('aria-activedescendant', activedescendant.id);
            droptarget.setAttribute('data-drag-lastdescendant', activedescendant.id);
            activedescendant.classList.add('activedescendant');
        }

        //otherwise (if the droptarget is empty) remove aria-owns and aria-activedescendant
        //since there's no elements for them to point to, they would just be redundant (or stale)
        else {
            droptarget.removeAttribute('aria-owns');
            droptarget.removeAttribute('aria-activedescendant');
        }

        //return the dragitems array
        return dragitems;
    };


    //get a parent reference for DOM node insertion when moving items
    //which can either be explicitly declared with [data-drag-act="parent"]
    //or it's the droptarget itself if no other parent is specified
    //nb. this allows for wrapper elements between the droptarget and dragitems
    //but we don't support items having different parents within a droptarget
    //so it's assumed that a single element wraps around all the items
    //which includes ignoring multiple "parent" declarations if those exist
    //nb. if a droptarget does use different wrappers around different items,
    //then moving items between them will eventually sort them all into the first
    #getParent(droptarget, dragitems) {
        const parent = droptarget.querySelector('[data-drag-act="parent"]');
        if(parent) {
            return parent;
        }
        return droptarget;
    };


    //convert event node to closest [data-drag-act] element
    //defaulting to "droptarget" if the type isn't specified
    //or null if we don't find it, or it's not inside this instance
    //nb. closest returns the node itself if it already matches
    #getClosest(node, type = 'droptarget') {

        if(node = node.closest(`[data-drag-act="${type}"]`)) {
            return this.#scope.contains(node) ? node : null;
        }
        return null;
    };


    //get the visible/accessible label element for a droptarget
    //nb. droptarget initialization throws an exception if this is null
    //because every container is required to have a labelling element
    #getLabel(droptarget) {
        return droptarget.querySelector('[data-drag-act="label"]');
    }


    //get the drop sort button (or not) for a droptarget
    //then if we have one, apply its default attributes
    //plus a droptarget attribute to declare that sort is available
    #getSorted(droptarget) {
        const sorted = droptarget.querySelector('[data-drag-act="sorted"]');
        if(sorted !== null) {
            sorted.setAttribute('role', 'button');
            sorted.setAttribute('aria-disabled', 'true');
            sorted.setAttribute('aria-label', this.language['sort-notes']);

            droptarget.setAttribute('data-drag-sorted', 'true');
        }
        return sorted;
    }


    //get the default multiple selection mode based on semantics
    //  -1 = mutimode by modifier keys or platform default (default)
    //   0 = multimode is locked to single selection (aria-checked with role=radio)
    //   1 = non-contiguous multimode by default (aria-checked with role=option)
    //       contiguous multimode by modifier key if available
    //nb. this returns a truthy value unless single selection is locked
    #getDefaultMultimode(droptarget, dragitems) {

        //for aria-checked selection, default to 0 if the first dragitem
        //uses [role="radio"], or default to 1 if the role is anything else
        //or if we have no items then we'll just have to default to -1
        //nb. this will get updated when containers refresh after update
        //so dropping radio items into an empty container will re-intialize
        //that container as a set of radios even if it wasn't before
        //nb. this assumes and requires that all dragitems within a
        //single droptarget container are using the same role and state
        if(droptarget.getAttribute('data-drag-state') == 'aria-checked') {
            if(!dragitems.length) {
                return -1;
            }
            return dragitems[0].getAttribute('role') == 'radio' ? 0 : 1;
        }

        //otherwise default to -1
        return -1;
    }


    //test whether a multiple selection modifier is pressed
    //or override if default multimode or platform defaults are different
    //nb. this returns a truthy value for either multimode
    //nb. if the touching flag is set, return multimode as though Ctrl was held
    //which neatly implements multiple selection for touch and voice control users
    //but don't do that unless we don't have an override or modifier
    //so that touch users who also have a bluetooth keyboard
    //can still use SHIFT + TAP to make contiguous selections
    //nb. unmodified keyboard selection also defaults to non-contiguous
    //because the Ctrl + Space combination would map to Cmd + Space
    //for MacOS, however that's a system shortcut that can't be used
    //(doesn't even expose an event, it's literally un-handleable)
    //but it wouldn't be appropriate to override that even if we could
    //and although we could fallback to Ctrl + Space or Shift + Space,
    //the former just isn't a thing in MacOS, Ctrl is really
    //only for triggering right-clicks with a single-button mouse
    //and Shift + Space is not the expected key combination for this
    //so it's arguably most intuitive just to not require a modifier
    //although both of those keystrokes are still supported anyway
    //nb. we don't need to account for the presence or lack of altKey
    //because either it makes no difference, or it's intercepted by the platform
    //except for space, which doesn't match e.key with " " when option is pressed
    //and means that option+space doesn't do anything, even though it fires an event
    //but that's only on MacOS, it's intercepted for a global context menu on Windows
    //and none of that really matters anyway, because it's all outside our control
    #getMultimode(e, droptarget) {
        switch(this.#collection[droptarget.id].multimode) {

            case 0 :
                return 0;

            case 1 :
                return e.shiftKey ? 2 : 1;

            default :
                return e.shiftKey ? 2 : (e.ctrlKey || e.metaKey || this.#touching || e.key) ? 1 : 0;
        }
    };


    //auto-scroll an activedescendant into view, if that's necessary
    //nb. this is primarily for high-zoom, but more generally applies
    //whenever the activedescendant is not entirely inside the viewport
    //emulating the behavior of browser auto-scroll with focused elements
    //this also applies when the droptarget itself has overflow scrolling
    //nb. viewport block aligning to center matches the default behaviour
    //of native focus auto-scroll, and means that we don't need to
    //adjust the position to account for the element's outline
    //however container nearest aligning mostly prevents the browser from
    //redundantly scrolling the page and the container at the same time
    //except in situations where that's actually necessary
    #activeScroll(droptarget) {

        const dragitem = droptarget.querySelector('#' + droptarget.getAttribute('aria-activedescendant'));
        if(dragitem) {

            const itembox = dragitem.getBoundingClientRect();
            const targetbox = droptarget.getBoundingClientRect();

            let options = {};
            if(droptarget.scrollHeight > droptarget.clientHeight || droptarget.scrollWidth > droptarget.clientWidth) {

                if(itembox.bottom > targetbox.bottom || itembox.top < targetbox.top) {
                    options.block = 'nearest';
                    options.inline = 'nearest';
                }
                if(itembox.right > targetbox.right || itembox.left < targetbox.left) {
                    options.block = 'nearest';
                    options.inline = 'nearest';
                }
                if(options.block || options.inline) {
                    dragitem.scrollIntoView(options);
                }
            }

            options = {};
            if(itembox.bottom > window.innerHeight || itembox.top < 0) {
                options.block = 'center';
                options.inline = 'nearest';
            }
            if(itembox.right > window.innerWidth || itembox.left < 0) {
                options.block = 'nearest';
                options.inline = 'center';
            }
            if(options.block && options.inline) {
                options.block = 'center';
            }
            if(options.block || options.inline) {
                dragitem.scrollIntoView(options);
            }
        }
    };


    //update a droptarget's activedescendant to a specified dragitem
    //if both references exist (not null) and they don't already match
    //first saving the current value to the lastdescendant attribute
    #activeUpdate(droptarget, dragitem) {

        if(droptarget && dragitem && droptarget.getAttribute('aria-activedescendant') != dragitem.id) {

            droptarget.setAttribute('data-drag-lastdescendant', droptarget.getAttribute('aria-activedescendant'));

            this.#collection[droptarget.id].dragitems.forEach((item) => {
                if(item === dragitem) {
                    droptarget.setAttribute('aria-activedescendant', item.id);
                    item.classList.add('activedescendant');
                }
                else {
                    item.classList.remove('activedescendant');
                }
            });
        }
    };


    //update dragitem selection numbers in sortable owner containers
    //nb. this is used in combination with the sorted button and
    //keyboard shortcut, so we can implement effective sorting
    //without the need for physical dragging or re-ordering actions
    //but we need visible and accessible numbers for that to be usable
    #getSelectionNumbers(owner) {

        this.#collection[owner.id].dragitems.forEach((dragitem) => {

            //get any existing value for the dragitem's aria-describedby
            //and remove any previously-applied number ID from its tokens
            //nb. this includes() is safe because the IDs are always generated
            //they're never hard-coded so there's no chance of syntax conflict
            let adb = dragitem.getAttribute('aria-describedby') || '';
            if(adb.includes('-number-')) {
                adb = adb.split(' ').slice(0, -1).join(' ');
                dragitem.setAttribute('aria-describedby', adb);
            }

            //remove any existing number element
            let number = dragitem.querySelector('[data-drag-act="number"]');
            if(number) {
                number.remove();
            }

            //if this is selected then get its index in the selection dragitems array
            let index = this.#selection.dragitems.findIndex((item) => item == dragitem);
            if(index >= 0) {

                //create a number element and assign a generated ID
                //nb. using the <u> element ("unarticulated annotation")
                //is semantically correct here, or at least, it's correct
                //if you buy into the idea that spurious re-definitions
                //of redundant presentational elements count as semantics lol
                //but it makes no difference anyway, screen readers don't
                //describe it any differently than if it was just a <span>
                let number = document.createElement('u');
                number.setAttribute('data-drag-act', 'number');
                number.id = this.constructor.#getID({
                    index   : this.#index,
                    type    : 'number',
                    counter : this.#counter ++
                });

                //nb. the number format is defined in lang because languages have
                //different kinds of numbering syntax, "#" is an american thing really
                //but for default english language content, "#1" is announced by
                //screenreaders as "Number 1", which helps to differentiate it from
                //built-in index descriptions, eg. "Willow, checked, 2 of 5, Number 1."
                //and it's also visually useful to support what the numbers mean
                number.textContent = this.#parseToken(this.language['sort-number'], 'number', (index + 1));

                //nb. adding new text inside the dragitem changes its accessible name
                //which triggers an event in the accessibility API, and if the
                //element is focused or activedescendant then it should be reannounced
                //however updating the checked state also triggers reannouncement
                //which would cause duplicate announcement in JAWS and NVDA
                //this is not a screen reader bug, it's the correct behavior
                //but it's rather counter-productive for what we're doing here
                //we just need the number to be included in regular reannouncement
                //theoretically, this kind of situation could be handled with aria-busy
                //but it's only supported in JAWS, and doesn't seem to work here anyway
                //however ... if we make the element aria-hidden then it doesn't
                //change the item's accessible name, so there's no duplication,
                //then assigning it as part of the item's accessible description
                //means it will then be included in the regular reannouncement :-)
                //(must admit, I was pretty pleased with myself for this trick :-D)
                //nb. however don't do this for Safari because it doesn't support
                //the descriptions, but it also doesn't do that duplicate announcement,
                //so we can just add it to the item text and then it's announced the same
                //nb. update the aria-describedby after a buffer delay, to ensure that
                //the number is always announced after the name and state information
                //the item's existing description text is also updated with a buffer delay
                //and we can't guarantee the order in which those async timers will finish
                //however the relative order of text within the compiled description
                //is determined by the order of IDREFS, so there's no chance of collision
                if(!owner.hasAttribute('data-drag-safari')) {
                    number.setAttribute('aria-hidden', 'true');
                }
                dragitem.appendChild(number);

                this.#buffer(() => {
                    dragitem.setAttribute('aria-describedby', adb + ' ' + number.id);
                });
            }
        });
    }


    //select a single dragitem
    #addSelection(dragitem, owner) {

        //don't select disabled items
        if(dragitem.getAttribute('aria-disabled') == 'true') {
            return;
        }

        //if the owner reference is still null, set it to this dragitem's owner
        //so that further selection is only allowed within the same container
        if(!this.#selection.owner) {
            this.#selection.owner = owner;
        }

        //or if that's already happened then compare it with this dragitem's owner
        //and if they're not the same container, return to prevent selection there
        else if(this.#selection.owner !== owner) {
            return;
        }

        //select this dragitem and add it to the selection items array
        dragitem.setAttribute(owner.getAttribute('data-drag-state'), 'true');
        this.#selection.dragitems.push(dragitem);

        //if this container is sortable, update the selection numbers
        if(owner.getAttribute('data-drag-sorted') == 'true') {
            this.#getSelectionNumbers(owner);
        }

        //set the default sorting flag to sort by traversal order
        this.#selection.nodesort = true;

        //stop the observer
        this.#observer.disconnect();

        //if the draginstance reference is set but isn't this instance
        const draginstance = this.constructor.#draginstance;
        if(draginstance && draginstance !== this) {

            //clear drag-valid from droptargets and remove any owner dragout class
            draginstance.#clearDragValid();
            draginstance.#selection.owner.classList.remove('dragout');

            //remove accessible descriptions from all the owner items
            draginstance.#describeDragitems(draginstance.#selection.owner);

            //reset all selections
            draginstance.#clearSelections();
        }

        //then update the draginstance reference to point to this
        this.constructor.#draginstance = this;
    };


    //select all dragitems between the current and previous activedescendant
    #addSelectionRange(droptarget) {

        //get the collection of dragitems inside this droptarget
        const dragitems = this.#collection[droptarget.id].dragitems;

        //define the range boundary items from the two descendant attributes
        let range = ['data-drag-lastdescendant', 'aria-activedescendant'].map((attr) => {
            return dragitems.find((item) => item.id == droptarget.getAttribute(attr));
        });

        //get the dragitems index of each boundary item in the order they were selected
        //then copy that to a second array of those indexes in dom traversal order
        let boundaries = [];
        range.forEach((rangeitem) => {
            boundaries.push(dragitems.findIndex(dragitem => rangeitem === dragitem));
        });
        let traversal = boundaries.toSorted((a, b) => a - b);

        //now re-compile the range items array to include the entire range
        //then reverse it if necessary to match the original selection order
        range = [];
        for(let n = traversal[0]; n <= traversal[1]; n ++) {
            range.push(dragitems[n]);
        };
        if(boundaries[0] > boundaries[1]) {
            range.reverse();
        }

        //remove any range items from the selection items array
        //nb. this is so the range can be iteratively passed to addSelection
        //without creating duplicates or having to adapt that method for pointer reference
        //nb. we don't need to aria unselect them cos they're gonna get reselected anyway
        this.#selection.dragitems = this.#selection.dragitems.filter((item) => {
            return !range.includes(item);
        });

        //now add the range to the end of the selection items array
        range.forEach((rangeitem) => {
            this.#addSelection(rangeitem, droptarget);
        });
    };


    //unselect a single dragitem
    #removeSelection(dragitem, droptarget = null) {

        //if droptarget is not specified, use the selection owner
        if(!droptarget) {
            droptarget = this.#selection.owner;
        }

        //unselect and remove this from the selection dragitems array
        dragitem.setAttribute(droptarget.getAttribute('data-drag-state'), 'false');
        this.#selection.dragitems = this.#selection.dragitems.filter((item) => {
            return item !== dragitem;
        });

        //if this container is sortable, update the selection numbers
        //nb. the selection owner might not be defined, but it's easier
        //just to create a new reference rather than check that first
        const owner = this.#getClosest(dragitem);
        if(owner.getAttribute('data-drag-sorted') == 'true') {
            this.#getSelectionNumbers(owner);
        }

        //if there are no remaining selections
        if(!this.#selection.dragitems.length) {

            //reset the sorting flag to sort by traversal order
            this.#selection.nodesort = true;

            //restart the observer on the scope element
            this.#observer.observe(this.#scope, {
                childList   : true,
                subtree     : true
            });

            //reset the draginstance reference
            this.constructor.#draginstance = null;
        }
    };


    //unselect all dragitems
    #clearSelections(droptarget = null) {

        //nothing to do if there are no selected items
        if(!this.#selection.dragitems.length) {
            return;
        }

        //unselect and remove every dragitem from the selection dragitems array
        //nb. this will also restart the observer if there are no selections left
        this.#selection.dragitems.forEach((dragitem) => {
            this.#removeSelection(dragitem, droptarget);
        });

        //reset the owner reference
        this.#selection.owner = null;
    };


    //do something after a short delay to give time for screen reader updates
    //nb. the 250ms value is trial and error guided by previous experience
    //that screen readers will have updated their snapshot within that time
    //eg. an injected status region works if you wait that long to populate it
    #buffer(fn) {
        window.setTimeout(fn, 250);
    }


    //apply drag-valid to valid droptargets
    #addDragValid() {

        for(const [ key, collection ] of Object.entries(this.#collection)) {

            const droptarget = collection.droptarget;
            const dragitems = collection.dragitems;
            const sorted = collection.sorted;

            //set drag-valid to indicate that items are selected
            droptarget.setAttribute('data-drag-valid', 'false');

            //if we have a sort button, enable and add it to the tab order
            //then associate it with the dragitems description element
            //so it can also announce the number of current selections
            //but only if this isn't safari which doesn't support descriptions
            //nb. this is applied to the sort button in every container
            if(sorted !== null) {
                sorted.removeAttribute('aria-disabled');
                sorted.setAttribute('tabindex', '0');
                if(!droptarget.hasAttribute('data-drag-safari')) {
                    sorted.setAttribute('aria-describedby', this.#describedby[this.#selection.owner.id].dragitems.id);
                }
            }

            //if this droptarget is not the selection owner
            if(droptarget !== this.#selection.owner) {

                //update drag-valid to also indicate that this is a valid drop location
                droptarget.setAttribute('data-drag-valid', 'true');

                //set aria-disabled on all its dragitems so they can't be selected
                //nb. this still allows users to navigate and review the items
                //as part of deciding whether to drop the selected items here
                //nb. remember whether each item was already disabled, so that
                //we can restore its initial disabled state when resetting this
                //but only if it doesn't already have that remembering attribute
                //so we don't do this for items that are only temporarily disabled
                //when the items in this container are already in the drag-valid state
                dragitems.forEach((dragitem) => {

                    if(!dragitem.hasAttribute('data-drag-disabled')) {
                        dragitem.setAttribute('data-drag-disabled', dragitem.getAttribute('aria-disabled') == 'true' ? 'true' : 'false');
                    }
                    dragitem.setAttribute('aria-disabled', 'true');
                });

                //apply accessible descriptions for the drop location state
                this.#describeDroptarget(droptarget, 'drop-notes');
            }
        }
    };


    //clear drag-valid from droptargets
    #clearDragValid() {

        //nothing to do if there are no selected items
        if(!this.#selection.dragitems.length) {
            return;
        }

        //reset drag-valid on all droptargets, and remove any dragout or dragover class
        //then reset selections and enable any disabled dragitems inside them
        for(const [ key, collection ] of Object.entries(this.#collection)) {

            const droptarget = collection.droptarget;
            const dragitems = collection.dragitems;
            const sorted = collection.sorted;

            //remove drag-valid and any dragover class
            droptarget.removeAttribute('data-drag-valid');
            droptarget.classList.remove('dragover');

            //if we have a sort button, disable and remove it from the tab order
            //then deassociate it from the dragitems description element
            if(sorted !== null) {
                sorted.setAttribute('aria-disabled', 'true');
                sorted.removeAttribute('tabindex');
                sorted.removeAttribute('aria-describedby');
            }

            //if this droptarget is not the selection owner
            //or it is when this comes after same-container drop sort
            //which we can identify from the residual value of nodesort
            if(droptarget !== this.#selection.owner || !this.#selection.nodesort) {

                //restore the enabled state of items that were temporarily disabled
                //nb. this still allows users to navigate and review the items
                //as part of deciding whether to drop the selected items here
                //nb. remember whether each item was already disabled, so that
                //we can restore its initial disabled state when resetting this
                dragitems.forEach((dragitem) => {
                    dragitem.removeAttribute('aria-disabled');
                    if(dragitem.getAttribute('data-drag-disabled') == 'true') {
                        dragitem.setAttribute('aria-disabled', 'true');
                    }
                    dragitem.removeAttribute('data-drag-disabled');
                });

                //if it's not the selection droptarget either
                //apply accessible descriptions for the default selection state
                if(droptarget !== this.#selection.droptarget) {
                    this.#describeDroptarget(droptarget, 'selection-notes');
                }

                //but if (it is the selection droptarget and) we have any selections
                else if(this.#selection.dragitems.length) {

                    //nb. JAWS and NVDA don't announce accessible description updates
                    //for a focused listbox element that has an activedescendant
                    //there are several workarounds for this, which involve either
                    //temporarily removing or invalidating aria-activedescendant
                    //but both of those approaches resulted in dual announcemt
                    //however synchronously removing the role, either side of updating
                    //the description, avoids the problem without that side-effect
                    //but don't do that for Safari because it stops the announcement
                    const role = droptarget.getAttribute('role');
                    if(!droptarget.hasAttribute('data-drag-safari')) {
                        droptarget.removeAttribute('role');
                    }

                    //apply accessible descriptions for the number of dropped items
                    this.#describeDroptarget(droptarget, 'dropped-items', this.#selection.dragitems.length);

                    //now restore the role
                    droptarget.setAttribute('role', role);

                    //then reset to the default selection state when it loses focus
                    //nb. the dropped items description is only relevant after a drop
                    //so this ensures that it has the default when it's next announced
                    droptarget.addEventListener('blur', () => {

                        this.#describeDroptarget(droptarget, 'selection-notes');
                    },
                    { once : true });

                    //hide and reset the droptarget description element for Safari
                    //but only after a short timer to ensure it's announced once
                    //nb. if we leave it in place then it will be announced
                    //again when the blur event resets to the selection state
                    //even if we removed aria-live before that text was updated
                    //conversely, if we remove it now then it won't be announced at all
                    //which sounds like a contradiction ... if changes in live behavior
                    //require a buffer update, then why does removing it now stop it
                    //being announced, but if that doesn't require a buffer update,
                    //then why does removing it onblur *not* stop it being announced?
                    //maybe the difference is related to co-occurring user interaction
                    //or in whether the live behavior is being added or removed
                    //don't really know the score there, but this is what we find
                    let announcer = this.#describedby[droptarget.id].droptarget;
                    if(droptarget.hasAttribute('data-drag-safari')) {
                        this.#buffer(() => {
                            announcer.setAttribute('hidden', '');
                            announcer.removeAttribute('aria-live');
                        });
                    }
                }
            }

            //otherwise (if it is the owner when this doesn't comes after same-container drop sort)
            else {

                //re-apply accessible descriptions for the default selection state
                //just in case the owner is now empty and needs the empty state description
                this.#describeDroptarget(droptarget, 'selection-notes');
            }
        }
    };


    //select or unselect items according to input multimode
    //in response to a single pointer or keyboard selection event
    #doSelectionThing(droptarget, dragitem, multimode) {
        switch(multimode) {

            //contiguous multiple selection (selection only)
            case 2 :

                //if the dragitem is not already selected, select it first
                if(dragitem.getAttribute(droptarget.getAttribute('data-drag-state')) == 'false') {
                    this.#addSelection(dragitem, droptarget);
                }

                //then select all the dragitems between this and the previous activedescendant
                this.#addSelectionRange(droptarget);

                //if we have any selections then apply drag-valid
                if(this.#selection.dragitems.length) {
                    this.#addDragValid();
                }

            break;

            //non-contiguous multiple selection (or unselection)
            case 1 :

                //if the dragitem is already selected
                if(dragitem.getAttribute(droptarget.getAttribute('data-drag-state')) == 'true') {

                    //if this is the only selection, clear drag valid
                    if(this.#selection.dragitems.length === 1) {
                        this.#clearDragValid();
                    }

                    //unselect this dragitem
                    this.#removeSelection(dragitem);

                    //if that was the last selection, reset the owner reference
                    if(!this.#selection.dragitems.length) {
                        this.#selection.owner = null;
                    }
                }

                //otherwise (if the items is not already selected)
                else {

                    //add this dragitem to the selection dragitems array
                    this.#addSelection(dragitem, droptarget);

                    //if we have any selections then apply drag-valid
                    if(this.#selection.dragitems.length) {
                        this.#addDragValid();
                    }
                }

            break;

            //exclusive single selection (or unselection)
            default :

                //is this dragitem the only selection
                const single = this.#selection.dragitems.length == 1 && this.#selection.dragitems.includes(dragitem);

                //clear drag-valid and reset all selections
                this.#clearDragValid();
                this.#clearSelections();

                //if this dragitem was not the only selection
                //reselect it then apply drag valid if that was successful
                //nb. this means that unmodified click will unselect all then select this dragitem,
                //unless it was the only selection, or disabled, in which case it will just unselect
                if(!single) {
                    this.#addSelection(dragitem, droptarget);
                    if(this.#selection.dragitems.length) {
                        this.#addDragValid();
                    }
                }

            break;
        }
    }


    //move selected items to droptarget (or not as the case may be)
    #doDropThing() {

        //if we have an owner reference, remove its dragout class if present
        if(this.#selection.owner) {
            this.#selection.owner.classList.remove('dragout');
        }

        //if we have a droptarget reference
        //nb. this also implies that we have owner and selected items
        if(this.#selection.droptarget) {

            //remove selection attributes before moving the items
            //in case the droptarget container uses a different one
            this.#selection.dragitems.forEach((dragitem) => {
                dragitem.removeAttribute(this.#selection.owner.getAttribute('data-drag-state'));
            });

            //move the selected items to the droptarget's insertion parent
            //while creating a new array of those nodes in insertion order
            let appendages = [];

            //if the sorting flag is set to traversal order
            //then insert each selected item as we find it in the owner dragitems array
            //nb. this is easier than abstracting a method to sort node arrays by index comparison
            //since the code would be basically this anyway, so might as well just insert as we find
            if(this.#selection.nodesort) {
                this.#collection[this.#selection.owner.id].dragitems.forEach((item) => {
                    let nodeitem = this.#selection.dragitems.find((dragitem) => dragitem === item);
                    if(nodeitem) {
                        this.#collection[this.#selection.droptarget.id].parent.appendChild(nodeitem);
                        appendages.push(nodeitem);
                    }
                });
            }

            //otherwise (if the flag is set to selection order)
            //then insert them in the order they already have in the selection array
            //nb. the selection dragitems array is always in the order they were selected
            else {
                this.#selection.dragitems.forEach((item) => {
                    this.#collection[this.#selection.droptarget.id].parent.appendChild(item);
                    appendages.push(item);
                });
            }

            //if prefers-reduced-motion isn't specified then animate the insertions
            //but don't include the first (or only) one because that might be confusing
            //nb. the purpose here is to provide an additional UI hint about what was moved
            //and it's not needed for a single item because that gets activedescedant
            //so it would just be a pointless delay, which might be disconcerting or annoying
            //nb. this hooks into whatever hiding method is specified in .insertion
            //which musn't be anything that removes it from the accessibility tree
            //eg. it can't be display or visibility, but it can be opacity or transform
            //nb. timing collisions won't matter because everything will still appear
            //eg. if you move a set of dragitems while the previous set is still animating
            //there can't be reference collisions either cos each is a separate instance
            //it also doesn't matter if the user selects dragitems that aren't yet visible
            //since there's no functional or programmatic difference in the nodes themselves
            //and for screen reader output, none of this will be perceivable at all
            //all the same, the animation should be very short, so it's visible but doesn't
            //introduce any significant delay before the appearance of being ready for
            //new interactions, since that period would probably seem to users like it's not
            if(window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
                appendages.shift();
                if(appendages.length) {
                    appendages.forEach((item) => {
                        item.classList.add('insertion');
                    });
                    const animator = window.setInterval(() => {
                        if(appendages.length) {
                            return appendages.shift().classList.remove('insertion');
                        }
                        window.clearInterval(animator);
                    }, 50);
                }
            }

            //rebuild and re-initialize the collection for the owner and droptarget
            //setting activedescendant in the droptarget to the last selected dragitem
            //which seems more intuitive since that was (the) one you just moved
            //nb. don't update the label, parent, or sort button, which are fixed at initialization
            //but we do need to update multimode in case it couldn't be set at initialisation
            //eg. if the container was empty and now contains items that have role=radio
            [ this.#selection.owner, this.#selection.droptarget ].forEach((droptarget) => {

                let setdescendant = null;
                if(this.#selection.droptarget === this.#selection.owner || droptarget !== this.#selection.owner) {
                    setdescendant = this.#getDragitems(droptarget).pop();
                }

                const dragitems = this.#getDroptarget(droptarget, setdescendant);
                this.#collection[droptarget.id].droptarget = droptarget;
                this.#collection[droptarget.id].dragitems = dragitems;
                this.#collection[droptarget.id].multimode = this.#getDefaultMultimode(droptarget, dragitems);
            });

            //clear drag-valid from droptargets and reset all selections
            //nb. pass the droptarget reference to clear selections so that
            //the selection state reset happens there, not in the owner,
            //in case this and the owner used different attributes
            //otherwise the dragitems would end up with both of them
            this.#clearDragValid();
            this.#clearSelections(this.#selection.droptarget);

            //focus the droptarget and auto-scroll the activedescendant
            this.#selection.droptarget.focus();
            this.#activeScroll(this.#selection.droptarget);

            //dispatch any instance callbacks
            this.#dispatchCallbacks();

            //then reset the droptarget reference
            this.#selection.droptarget = null;

            //then return true to indicate that drop occured
            //nb. this can be used as a caller success condition
            return true;

        }

        //otherwise return false for no drop
        return false;
    };


    //parse a language token with its value and return the string
    #parseToken(str, token, value) {
        return str.replace(`\{\{${token}\}\}`, value);
    }


    //compile and apply accessible description to a group of dragitems
    //or remove the description if none of the items are selected
    //nb. we don't support applying a description for zero items
    //cos like, what's the point, it's just unecessary verbosity
    //the state of no selections is implied by the lack of description
    #describeDragitems(droptarget, count = 0, dragitem = null) {

        //get the collection of dragitems inside this container
        let dragitems = this.#collection[droptarget.id].dragitems;

        //if the selection count is zero, just clear all descriptions and we're done
        //nb. using zero-width space because the element can't be empty
        if(!count) {
            dragitems.forEach((dragitem) => {
                this.#describedby[droptarget.id].dragitems.textContent = '\u200b';
            });
            return;
        }

        //don't update the description if the multimode is locked to single selection
        //since that would always be "1 item selected", which is redundant
        if(!this.#collection[droptarget.id].multimode) {
            return;
        }

        //similarly if we have a specific dragitem reference and it's disabled
        //then don't update the description, because unselected items shouldn't say it
        //especially since it's confusing if it says "x items selected" in response
        //to an event on a disabled dragitem that hasn't become selected
        if(dragitem && dragitem.getAttribute('aria-disabled') == 'true') {
            return;
        }

        //get a parsed description string according to the selection count
        //nb. "selected-items" has a {{count}} token for the number of selected items
        //and an {{items}} token referring to the single or plural language for item(s)
        let description = this.language['selected-items'];
        description = this.#parseToken(description, 'count', count);
        description = this.#parseToken(description, 'items', this.language[count == 1 ? 'item-single' : 'item-plural']);

        //now wait a moment, then update the accessible description element
        //nb. we use same the description for all dragitems in the same container
        //so the number of selections can be announced for any selectable item
        //in addition to (after) the selected state of that individual item
        //nb. the delay is to make sure it's announced after the change in selected state
        //otherwise the updated description might be announced before the updated state
        //which doesn't match the usual reading order of accessible descriptions
        //it also seems to reduce the incidence of duplicate description announcements
        //where the description is announced both before and after the udpated state
        this.#buffer(() => {
            this.#describedby[droptarget.id].dragitems.textContent = description;
        });
    };


    //clear the accessible description for a group of dragitems
    //nb. using zero-width space because the element can't be empty
    #undescribeDragitems(dragitem) {

        const droptarget = this.#getClosest(dragitem);
        this.#describedby[droptarget.id].dragitems.textContent = '\u200b';
    };


    //compile and apply accessible description for a droptarget
    #describeDroptarget(droptarget, key, count = 0) {

        //get a parsed description string according to the key and count value
        //nb. "selection-notes" and "drop-notes" don't have any tokens
        //although "selection-notes" is replaced with "empty-notes" if there are no items
        //whereas "dropped-items" has a {{count}} token for the number of dropped items
        //and an {{items}} token referring to the single or plural language for item(s)
        //so we can use the count value to detect whether token parsing is needed
        let description = this.language[key];
        if(key == 'selection-notes' && !this.#collection[droptarget.id].dragitems.length) {
            description = this.language['empty-notes'];
        }
        else if(count) {
            description = this.#parseToken(description, 'count', count);
            description = this.#parseToken(description, 'items', this.language[count == 1 ? 'item-single' : 'item-plural']);
        }

        //update the accessible description element
        this.#describedby[droptarget.id].droptarget.textContent = description;
    };


    //---//


    //bind agnostic events
    #bindAgnosticEvents() {

        //instance mutation observer
        this.#observer = new MutationObserver((mutations) => {

            mutations.forEach((mutation) => {

                //assemble an array of added and removed nodes
                //ignoring anything that isn't a dragitem element
                //nb. this doesn't stop them being inserted or removed
                //it's just that we don't need to respond to anything else
                let nodes = [ ...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes) ].filter((node) => {
                    return (node.nodeType == 1 && node.getAttribute('data-drag-act') == 'dragitem');
                });
                if(nodes.length) {

                    //get the closest droptarget from the mutation target node
                    //nb. in the case of item insertion, the target node is the item
                    //whereas for item removal, the target is the item's previous parent
                    //either way, getClosest will return the surrounding droptarget
                    //or null if the element is not actually inside a droptarget
                    let droptarget = this.#getClosest(mutation.target);
                    if(droptarget) {

                        //rebuild and re-initialize the collection for this droptarget
                        //setting activedescendant to whatever it already is, which will
                        //default to the first dragitem if the container was previously empty
                        //or will remove aria-activedescendant and aria-owns if it's now empty
                        //nb. don't update the label, parent, or sort button, which are fixed at initialization
                        //but we do need to update multimode in case it couldn't be set at initialisation
                        //eg. if the container was empty and now contains items that have role=radio
                        const setdescendent = droptarget.querySelector('#' + droptarget.getAttribute('aria-activedescendant'));

                        const dragitems = this.#getDroptarget(droptarget, setdescendent || null);
                        this.#collection[droptarget.id].droptarget = droptarget;
                        this.#collection[droptarget.id].dragitems = dragitems;
                        this.#collection[droptarget.id].multimode = this.#getDefaultMultimode(droptarget, dragitems);

                        //dispatch any instance callbacks
                        //nb. if multiple dragitems are added or removed iteratively
                        //then the observer will record each one as a separate mutation
                        //and therefore this event will be dispatched several times
                        //however since the observer responds asynchonously, all of them
                        //are already in the DOM by the time the first callback dispatches
                        //so this.collection in every callback will reflect all the changes
                        this.#dispatchCallbacks();
                    }
                }
            });
        });

        //start the observer on the scope element
        this.#observer.observe(this.#scope, {
            childList   : true,
            subtree     : true
        });


        //scope focus listener
        this.#scope.addEventListener('focus', (e) => {

            console.log("focus listener")

            //look for relevant references from the event node
            const droptarget = this.#getClosest(e.target);
            const sorted = this.#getClosest(e.target, 'sorted');

            //nothing to do here if we don't have a droptarget reference
            if(!droptarget) {
                return;
            }

            //if we have a sort button, remove any dragout class
            //from the droptarget, and then set a focus-within class
            //to then be removed again when the button loses focus
            //nb. this provides a selector equivalent to :focus-within
            //which is not widely supported enough to use just yet
            //but is a necessary selector to ensure that the droptarget
            //retains its focus appearance when the button is focused
            //while also allowing variation, eg. don't show the activedescendant
            //outline if focus is on the button, since you can't use arrows there
            if(sorted !== null) {
                droptarget.classList.remove('dragout');
                droptarget.classList.add('focus-within');
                sorted.addEventListener('blur', (e) => {
                    droptarget.classList.remove('focus-within');
                },
                { once : true });

                return;
            }

            //hide and reset the droptarget description element for Safari
            //also saving a shortcut reference for later in the function
            let announcer;
            if(droptarget.hasAttribute('data-drag-safari')) {
                announcer = this.#describedby[droptarget.id].droptarget;
                announcer.setAttribute('hidden', '');
                announcer.removeAttribute('aria-live');
            }

            //if we have a selection owner
            if(this.#selection.owner) {

                //update the dragout class, so it only shows on the owner
                //when dragitems are selected and focus is on a different container
                if(droptarget === this.#selection.owner) {
                    droptarget.classList.remove('dragout');
                }
                else {
                    this.#selection.owner.classList.add('dragout');
                }

                //make the description element a live region for Safari
                //nb. VoiceOver doesn't support the accessible descriptions
                //but the "x items dropped" confirmation is kinda critical
                //so if we convert the element to a live region here
                //preceding but not directly triggering a potential drop action
                //then it will work by the time the drop action needs announcing
                //nb. assertive or role=alert makes VO interrupt itself
                //preventing the label and activedescendant from being announced
                //while role=status is often announced twice when it updates
                //but aria-live=polite works fine, and has the right assertiveness
                //it gets announced after the listbox label and activedescendant
                if(announcer) {
                    announcer.textContent = '';
                    announcer.removeAttribute('hidden');
                    announcer.setAttribute('aria-live', 'polite');
                }
            }

            //auto-scroll the activedescendant into view, if that's necessary
            this.#activeScroll(droptarget);

        //nb. use the capture phase because focus events don't bubble
        }, true);

    }


    ///bind pointer events
    #bindPointerEvents() {

        //scope touchstart listener to set the touching flag
        //nb. simulated mouse events are only dispatched after ~50ms
        //so the platform can differentiate things like double-tap and
        //pinch-zoom, and only fire mouse events for mouse-like single taps
        //this means that we can't reset the flag from touchend events
        //or it would already be false when the simulated mousedown occurs
        //so we only set it using touchstart, then reset it from mouseup
        //which must inevitably follow the touchstart that preceded it
        this.#scope.addEventListener('touchstart', (e) => {
            this.#touching = true;
        });
        //nb. same thing for pointer events so it handles devices
        //that don't implement apple's event model (e.g. windows tablets)
        this.#scope.addEventListener('pointerdown', (e) => {
            if(e.pointerType == 'touch' || e.pointerType == 'pen') {
                this.#touching = true;
            }
        });
        //nb. Android/TalkBack doesn't generate touch events at all
        //even its pointerdown event is now "mouse" rather than "touch"
        //however simulated mouse events in both TalkBack and VoiceOver
        //return a detail property of 0, because they don't correspond
        //with literal pointer clicks, so we can use that to handle it
        //nb. this is also matched by spoken "click ..." commands with
        //Voice Control in iOS and MacOS, which is consistent with
        //their mousedown events not triggering container focus events
        this.#scope.addEventListener('mousedown', (e) => {
            if(!this.#touching && e.detail == 0) {
                this.#touching = true;
            }
        });


        //document mousedown listener to set the pointer target reference
        //nb. this is on document because it needs to be globally accurate
        //in order to filter mouseups that began outside the instance
        document.addEventListener('mousedown', (e) => {
            this.#pointer = e.target;
        });


        //scope mousedown listener
        this.#scope.addEventListener('mousedown', (e) => {

            //ignore non-left clicks or the second half of a double-click
            if(e.button > 0 || e.detail > 1) {
                return;
            }

            //look for relevant references from the event node
            const dragitem = this.#getClosest(e.target, 'dragitem');
            const droptarget = this.#getClosest(e.target);

            //update activedescendant to the target dragitem, if applicable
            //nb. this has to happen before the focus event that mousedown triggers
            //so that intial container focus shows the expected outline
            this.#activeUpdate(droptarget, dragitem);

            //focus the droptarget if this event didn't come from a pointer click
            //nb. this handles mousedown events triggered by voice control
            //which don't generate a corresponding droptarget focus event
            //and if the droptarget doesn't have focus, then spoken keyboard commands
            //like "press enter key" won't work, so setting focus ensures they will
            if(e.detail === 0) {
                droptarget.focus();
            }
        });


        //scope mouseup listener
        this.#scope.addEventListener('mouseup', (e) => {

            //ignore non-left clicks or the second half of a double-click
            if(e.button > 0 || e.detail > 1) {
                return;
            }

            //look for relevant references from the event node
            const dragitem = this.#getClosest(e.target, 'dragitem');
            const droptarget = this.#getClosest(e.target);
            const sorted = this.#getClosest(e.target, 'sorted');

            //nothing to do if we don't have a drop target
            if(!droptarget) {
                return;
            }

            //ignore mouseups that aren't consistent with the mousedown pointer target
            //=> for selection actions, both events must be inside the same dragitem
            //=> for drop actions, both events must be inside the same droptarget
            //nb. this allows for some user imprecision with single pointer drop actions
            //and in cases where the events don't match, the mouseup determines the action
            //eg. if the user starts inside the container but ends inside the sort button
            //which allows them to change their mind without aborting the drag
            if(dragitem) {
                if(!(dragitem.contains(this.#pointer) || this.#pointer.contains(dragitem))) {
                    return;
                }
            }
            else if(!(droptarget.contains(e.target) && droptarget.contains(this.#pointer))) {
                return;
            }

            //if we have any selected items
            if(this.#selection.dragitems.length) {

                //if we have a droptarget and it's not the owner
                //(when owner is not null, implied by having some selected items)
                //or it is the owner but we also have a sort button reference
                //nb. for sort actions only, the droptarget and owner can be the same
                //so it's possible to use selection sorting within a single container
                if(droptarget && (droptarget !== this.#selection.owner || sorted !== null)) {

                    //set the sorting flag according to whether we have a sort button
                    //nb. sorting by node order is the default, so what's described
                    //as "sorting" is actually not doing that lol, hence it's false
                    this.#selection.nodesort = sorted === null;

                    //remove accessible descriptions from the owner dragitems collection
                    this.#describeDragitems(this.#selection.owner);

                    //set the selection droptarget to this container
                    //then drop the selected items into the droptarget container
                    this.#selection.droptarget = droptarget;
                    this.#doDropThing();

                    //nothing more to do here
                    return;
                }
            }

            //nothing more to do here if we don't have a dragitem
            if(!dragitem) {
                return;
            }

            //clear the dragitems accessible description
            //nb. this is necessary because the selected items count might increase
            //but the delay before accessible descriptions are updated will mean
            //the old value is announced before that, eg. "2 items selected, 3 items selected"
            //however, removing the description in advance of doing all that means
            //it has no description at the point when its selected state changes
            //and will thence only announce the updated description at the end
            this.#undescribeDragitems(dragitem);

            //select or unselect items according modifiers, platform defaults, or overrides
            this.#doSelectionThing(droptarget, dragitem, this.#getMultimode(e, droptarget));

            //apply accessible descriptions for the number of selected items
            //passing this dragitem for disabled state checking that shouldn't re-announce
            //nb. if there are no selected items then the descriptions will be removed
            this.#describeDragitems(droptarget, this.#selection.dragitems.length, dragitem);

            //reset the pointer reference
            this.#pointer = null;
        });


        //document mouseup listener
        //nb. this is on document because reset events could come from anywhere
        document.addEventListener('mouseup', (e) => {

            //ignore non-left clicks or the second half of a double-click
            if(e.button > 0 || e.detail > 1) {
                return;
            }

            //reset the touching flag
            this.#touching = false;

            //look for relevant references from the event node
            const dragitem = this.#getClosest(e.target, 'dragitem');
            const droptarget = this.#getClosest(e.target);

            //if we don't have a dragitem, and either we don't have a droptarget
            //or the droptarget is the selection owner and the multiple selection modifier is not pressed
            if(!dragitem) {
                if(!droptarget || (droptarget === this.#selection.owner)) {

                    //clear drag-valid from droptargets
                    this.#clearDragValid();

                    //if we have an owner reference, remove any owner dragout class
                    //and remove accessible descriptions from all the owner items
                    if(this.#selection.owner) {
                        this.#selection.owner.classList.remove('dragout');
                        this.#describeDragitems(this.#selection.owner);
                    }

                    //reset all selections
                    this.#clearSelections();
                }
            }
        });

        //block all click events inside droptarget containers
        //nb. droptargets shouldn't contain other interactive elements
        //so this reinforces that by making them functionally useless
        this.#scope.addEventListener('click', (e) => {
            if(this.#getClosest(e.target)) {
                e.preventDefault();
                return;
            }
        });
    }


    ///bind drag events
    #bindDragEvents() {

        //scope dragstart listener
        this.#scope.addEventListener('dragstart', (e) => {

            //look for relevant references from the event node
            const dragitem = this.#getClosest(e.target, 'dragitem');
            const droptarget = this.#getClosest(e.target);

            //ignore this event if we don't have both those references
            //nb. this handles the posssibility of other natively-draggable
            //content inside the instance scope, such as links and images
            //but don't prevent default because there's no cause for blocking them
            if(!(dragitem && droptarget)) {
                return;
            }

            //block this event if the selection owner is defined but isn't this dragitem's owner
            if(this.#selection.owner && this.#selection.owner !== this.#getClosest(dragitem)) {
                e.preventDefault();
                return;
            }

            //block this event if the dragitem is disabled
            if(dragitem.getAttribute('aria-disabled') == 'true') {
                e.preventDefault();
                return;
            }

            //(otherwise) if the dragitem is not already selected
            if(dragitem.getAttribute(droptarget.getAttribute('data-drag-state')) == 'false') {

                //clear the dragitem accessible description
                //nb. this is necessary because the selected items count might increase
                //but the delay before accessible descriptions are updated will mean
                //the old value is announced before that, eg. "2 items selected, 3 items selected"
                //however, removing the description in advance of doing all that means
                //it has no description at the point when its selected state changes
                //and will thence only announce the updated description at the end
                this.#undescribeDragitems(dragitem);

                //select items according modifiers, platform defaults, or overrides
                this.#doSelectionThing(droptarget, dragitem, this.#getMultimode(e, droptarget));

                //apply accessible descriptions for the number of selected items
                this.#describeDragitems(droptarget, this.#selection.dragitems.length);
            }

            //update activedescendant to the target dragitem, if necessary
            this.#activeUpdate(droptarget, dragitem);

            //if we have an owner reference, add the dragout class
            if(this.#selection.owner) {
                this.#selection.owner.classList.add('dragout');
            }

            //nb. we don't need the transfer data, but we have to define something
            //otherwise the drop action won't work in some implementations
            e.dataTransfer.setData('text/uri-list', 'https://www.tpgi.com/');

            //nb. this allows us to toggle the dropEffect in dragover events
            //so that the platform cursor will indicate valid droptargets
            //and the subsequent drop action will register as allowed
            e.dataTransfer.effectAllowed = 'copy';
        });


        //document dragenter listener to maintain the dragenter reference
        //filtered with draginstance so it only responds so this
        //nb. this is on document because the user could drag outside the scope
        document.addEventListener('dragenter', (e) => {
            if(this.constructor.#draginstance !== this) {
                return;
            }
            this.#dragenter = e.target;
        });


        //document dragleave listener
        //nb. this is on document because the user could drag outside the scope
        document.addEventListener('dragleave', (e) => {

            //filter with draginstance so it only responds so this
            if(this.constructor.#draginstance !== this) {
                return;
            }

            //look for a droptarget reference from the dragenter node
            //but if that's the owner then it's not a valid droptarget
            let droptarget = this.#getClosest(this.#dragenter);
            if(droptarget === this.#selection.owner) {
                droptarget = null;
            }

            //if the droptarget is different from the selection droptarget
            //(or we have only have one of those and the other is null)
            if(droptarget !== this.#selection.droptarget) {

                //if we have a selection droptarget, clear its existing dragover class
                //otherwise apply the dragover class to the new droptarget reference
                if(this.#selection.droptarget) {
                    this.#selection.droptarget.classList.remove('dragover');
                }
                else {
                    droptarget.classList.add('dragover');
                }

                //now update the selection droptarget
                this.#selection.droptarget = droptarget;
            }
        });


        //document dragover listener
        //nb. this is on document because the user could drag outside the scope
        document.addEventListener('dragover', (e) => {

            //filter with draginstance so it only responds so this
            if(this.constructor.#draginstance !== this) {
                return;
            }

            //look for relevant references from the dragenter node
            //but if the droptarget is the owner then it's not a valid droptarget
            //unless we have a sort button reference, in which case it's allowed
            //nb. so that you can sort items within the same owner container
            let droptarget = this.#getClosest(this.#dragenter);
            const sorted = this.#getClosest(this.#dragenter, 'sorted');
            if(droptarget === this.#selection.owner && sorted === null) {
                droptarget = null;
            }

            //set the dropEffect according to whether we have a valid droptarget
            //nb. using "copy" produces the (+) cursor which nominally indicates copy
            //however the "move" cursor is no different than the default cursor
            //and the copy cursor is more recognizably associated with drag and drop
            //for web content where copy functionality is almost never used anyway
            e.dataTransfer.dropEffect = droptarget ? 'copy' : 'none';

            //if we have any selected items and this event is inside the scope
            //then prevent default to allow the dragging items to be dragged
            //nb. this doesn't actually make any difference while you're dragging
            //but if we don't do this then the drop action won't register as allowed
            //even though our custom drop code will move the items either way
            //but the native UI will do the ghost-return animation as though it failed
            if(this.#selection.dragitems.length && this.#scope.contains(e.target)) {
                e.preventDefault();
            }
        });


        //scope drop listener
        this.#scope.addEventListener('drop', (e) => {

            //set the sorting flag according to whether we have a sort button
            //nb. sorting by node order is the default, so what's described
            //as "sorting" is actually not doing that lol, hence it's false
            const sorted = this.#getClosest(this.#dragenter, 'sorted');
            this.#selection.nodesort = sorted === null;

            //then if we do have a sort button but don't have a droptarget
            //set droptarget to the owner so the drop action will complete
            if(sorted !== null && !this.#selection.droptarget) {
                this.#selection.droptarget = this.#selection.owner;
            }

            //drop any selected items into the droptarget container, if we have them
            //and if that returns success then prevent default to allow the action
            //nb. it shouldn't be possible for this to be false if the drop event fires at all
            //because of how we're managing other drag events, but just in case
            if(this.#doDropThing()) {
                e.preventDefault();
            }
        });


        //document dragend listener
        //nb. this is on document because the user could drag outside the scope
        document.addEventListener('dragend', (e) => {

            //filter with draginstance so it only responds so this
            if(this.constructor.#draginstance !== this) {
                return;
            }

            //if we have an owner reference, remove its dragout class if present
            if(this.#selection.owner) {
                this.#selection.owner.classList.remove('dragout');
            }
        });

    }


    ///bind keyboard events
    #bindKeyboardEvents() {

        //scope keydown listener
        this.#scope.addEventListener('keydown', (e) => {

            //look for relevant references from the event node
            const droptarget = this.#getClosest(e.target);
            const sorted = this.#getClosest(e.target, 'sorted');

            //nothing to do here if we don't have a droptarget
            if(!droptarget) {
                return;
            }

            //identify relevant event keys and ignore the rest
            //nb. lowercase all the key names so we can test letter keys without case variation
            let keyname = (this.constructor.#keynames.find((key) => key == e.key.toLowerCase()) || '').toLowerCase();
            if(!keyname || keyname == 'escape') {
                return;
            }

            //if we have a sort button reference, check for supported actions
            //=> Enter or Ctrl/Cmd + S are allowed
            //=> Space is converted to Enter
            //=> any other relevant key is blocked
            //nb. button elements should be clickable with either Enter or Space
            //so we rewrite the keyname to stop it from triggering item selection
            if(sorted !== null) {
                if(keyname == '\u0020') {
                    keyname = 'enter';
                }
                if(!(keyname == 'enter' || keyname == 's')) {
                    e.preventDefault();
                    return;
                }
            }

            //Space, Ctrl/Cmd + X = select or unselect this dragitem
            //nb. it feels safer to refer to Space as ("\u0020") rather than its literal keyname (" ")
            //nb. using X won't affect the user's clipboard data because of preventDefault
            //nb. X can only be used to select, not to unselect, because that's more
            //conceptually consistent with how Ctrl+X works in native environments
            //at least in Windows, it doesn't exist in MacOS, but no point filtering that
            if(keyname == '\u0020' || keyname == 'x') {

                //ignore X if unmodified
                //nb. test the modifiers directly, rather than using getMultimode
                //because that abstraction exists to allow us to re-map modifiers
                //or implement overrides according to platform or instance defaults
                //where in this case it's a standard platform-native modifier
                if(keyname == 'x' && !(e.ctrlKey || e.metaKey)) {
                    return;
                }

                //block key repeats to prevent rapid state flashing
                if(e.repeat) {
                    e.preventDefault();
                    return;
                }

                //find a dragitem reference from the droptarget's activedescendant
                const dragitem = droptarget.querySelector('#' + droptarget.getAttribute('aria-activedescendant'));

                //if we have a dragitem and a matching or null selection owner
                if(dragitem && (!this.#selection.owner || this.#selection.owner === droptarget)) {

                    //block explicit selection in MacOS/Safari unless the items is not selected
                    //nb. VoiceOver (with a keyboard) implements an auto-selection model
                    //for listboxes, the same behavior as desktop Finder navigation
                    //and there's no way to override or stop it from doing this
                    //so the only way to make its selection announcements follow the
                    //selections, is to make the selections follow its announcements
                    //however allowing this to work when unselected allows it to be used
                    //to select the first item when tabbing to the container
                    //rather than having to arrow down and then up again, which won't
                    //apply in any other case because navigating causes selection
                    if(droptarget.getAttribute('data-drag-safari') == 'macos') {
                        if(dragitem.getAttribute(droptarget.getAttribute('data-drag-state')) == 'true') {
                            e.preventDefault();
                            return;
                        }
                    }

                    //if the key is Space or the item is currently unselected
                    //nb. this prevents Ctrl+X from unselecting items
                    if(keyname == '\u0020' || dragitem.getAttribute(droptarget.getAttribute('data-drag-state')) == 'false') {

                        //clear the dragitems accessible description
                        //nb. this is necessary because the selected items count may change
                        //but the delay before accessible descriptions are updated will mean
                        //the old value is announced before that, eg. "2 items selected, 3 items selected"
                        //however, removing the description in advance of doing all that means
                        //it has no description at the point when its selected state changes
                        //and will thence only announce the updated description at the end
                        this.#undescribeDragitems(dragitem);

                        //select or unselect items according modifiers, platform defaults, or overrides
                        this.#doSelectionThing(droptarget, dragitem, this.#getMultimode(e, droptarget));

                        //apply accessible descriptions for the number of selected items
                        //passing this dragitem for disabled state checking that shouldn't re-announce
                        //nb. if there are no selected items then the descriptions will be removed
                        this.#describeDragitems(droptarget, this.#selection.dragitems.length, dragitem);
                    }
                }
            }

            //Ctrl/Cmd + A = select all dragitems within this droptarget
            //nb. using this won't affect the user's clipboard data because of preventDefault
            //nb. this keystroke only selects and can't be used for unselection
            //because it's more akin to range selection so it should that match that behavior
            else if(keyname == 'a') {

                //ignore this if unmodified
                if(!(e.ctrlKey || e.metaKey)) {
                    return;
                }

                //block key repeats to prevent rapid state flashing
                if(e.repeat) {
                    e.preventDefault();
                    return;
                }

                //if the multimode is not locked to single selection
                if(this.#collection[droptarget.id].multimode) {

                    //find a dragitem reference from the droptarget's activedescendant
                    const dragitem = droptarget.querySelector('#' + droptarget.getAttribute('aria-activedescendant'));

                    //if we have a dragitem and a matching or null selection owner
                    if(dragitem && (!this.#selection.owner || this.#selection.owner === droptarget)) {

                        //clear the dragitems accessible description
                        this.#undescribeDragitems(dragitem);

                        //get the collection of dragitems inside this droptarget container
                        const dragitems = this.#collection[droptarget.id].dragitems;

                        //don't do this if all the items are already selected
                        //because that will trigger unecessary description updates
                        if(this.#selection.dragitems.length < dragitems.length) {

                            //empty the selection items array
                            //nb. emptying the array first means these selections are added from top to bottom
                            //rather than being a separate sub-set after any existing selections
                            //which means the selection order will also match the traversal order
                            //and is similar to how range selection works, where creating a range that
                            //encompasses already-selected items will re-index them in the range order
                            //both of which seem to me like the most intuitive and coherent thing to do
                            //nb. we don't need to aria unselect them cos they're gonna get reselected anyway
                            this.#selection.dragitems = [];

                            //select all the dragitems
                            dragitems.forEach((item) => {
                                this.#addSelection(item, droptarget);
                            });

                            //if we have any selections then apply drag-valid
                            if(this.#selection.dragitems.length) {
                                this.#addDragValid();
                            }

                            //apply accessible descriptions for the number of selected items
                            //nb. if there are no selected items then the descriptions will be removed
                            this.#describeDragitems(droptarget, this.#selection.dragitems.length);
                        }
                    }
                }
            }

            //Enter (not sorted), Ctrl/Cmd + V = drop selected items (in dom traversal order)
            //nb. we don't implement Ctrl/Cmd + M because that's a native action on MacOS
            //(minimize all windows) and there's no justification for overriding it
            //because there's no good precedent for responding to it in the first place
            //it was just an ivory-sky suggestion from the ARIA 1.0 authoring practices
            //to go with the aria-grabbed semantics that are deprecated now
            else if((keyname == 'enter' && sorted === null) || keyname == 'v') {

                //block key repeats to avoid unecessary evaluations
                if(e.repeat) {
                    e.preventDefault();
                    return;
                }

                //ignore V and M if unmodified
                if((keyname == 'v' || keyname == 'm') && !(e.ctrlKey || e.metaKey)) {
                    return;
                }

                //if we have a selection owner and it's not this droptarget
                if(this.#selection.owner && droptarget !== this.#selection.owner) {

                    //remove accessible descriptions from the owner dragitems collection
                    this.#describeDragitems(this.#selection.owner);

                    //set the selection droptarget to this and then drop the items into it
                    this.#selection.droptarget = droptarget;
                    this.#doDropThing();
                }
            }

            //Enter (sorted), Ctrl/Cmd + S = drop selected items in the order they were selected
            else if((keyname == 'enter' && sorted !== null) || keyname == 's') {

                //block key repeats to avoid unecessary evaluations
                if(e.repeat) {
                    e.preventDefault();
                    return;
                }

                //ignore S if unmodified
                if((keyname == 's') && !(e.ctrlKey || e.metaKey)) {
                    return;
                }

                //if we have a droptarget and an owner, and the droptarget is sortable
                //nb. for sorting actions the droptarget and owner can be the same
                //so it's possible to use selection sorting within a single container
                //nb. don't respond to Ctrl + S if the droptarget isn't sortable
                //even though we could still support it without needing the sort button
                //then the availability of sorting will be consistent for all users
                if(droptarget && this.#selection.owner && droptarget.getAttribute('data-drag-sorted') == 'true') {

                    //focus the droptarget, in case focus was on the button
                    //nb. the droptarget needs to be focused before doDropThing
                    //otherwise it won't have the expected state information
                    //(which is set when the droptarget receives focus)
                    droptarget.focus();

                    //set the sorting flag to sort by selection order
                    this.#selection.nodesort = false;

                    //remove accessible descriptions from the owner dragitems collection
                    this.#describeDragitems(this.#selection.owner);

                    //set the selection droptarget to this and then drop the items into it
                    this.#selection.droptarget = droptarget;
                    this.#doDropThing();
                }
            }

            //ArrowFoo, PageFoo, Home, End = activedescendant navigation
            else {

                //ignore the Home and End keys in MacOS/Safari
                //nb. these can't be handled when VO is running, so just ignore them
                //although they are handled if Shift is pressed, but it would be
                //confusing to only support them when used for range selection
                if(droptarget.getAttribute('data-drag-safari') == 'macos') {
                    if(keyname == 'home' || keyname == 'end') {
                        return;
                    }
                }

                //get the current activedescendant ID
                const activeid = droptarget.getAttribute('aria-activedescendant');

                //iterate by index through the dragitems inside this droptarget
                //and identify the node index of the current activedescendant
                //from which we can derive the node index of the next one
                //depending on which specific navigation key was used
                //nb. using for() rather than forEach() so that we can use continue
                //and optimize the loop to only test keys on the activedescendant
                //nb. arrow keys cycle round, but other navigation keys don't
                const dragitems = this.#collection[droptarget.id].dragitems;
                let nextindex = -1;
                let lastindex = dragitems.length - 1;

                for(let [ n, item ] of dragitems.entries()) {

                    if(item.id != activeid) { continue; }

                    switch(true) {

                        case (keyname == 'arrowdown' || keyname == 'arrowright') :
                            nextindex = (n == lastindex) ? 0 : n + 1;
                            break;

                        case (keyname == 'pagedown') :
                            nextindex = (n + 5 > lastindex) ? lastindex : n + 5;
                            break;

                        case (keyname == 'end') :
                            nextindex = lastindex;
                            break;

                        case (keyname == 'arrowup' || keyname == 'arrowleft') :
                            nextindex = (n == 0) ? lastindex : n - 1;
                            break;

                        case (keyname == 'pageup') :
                            nextindex = (n - 5 < 0) ? 0 : n - 5;
                            break;

                        case (keyname == 'home') :
                            nextindex = 0;
                            break;

                    }
                };

                //block this event if we don't have a nextindex
                //nb. we won't have one if the container is empty
                if(nextindex < 0) {
                    e.preventDefault();
                    return;
                }

                //if the multimode is contiguous
                if(this.#getMultimode(e, droptarget) === 2) {

                    //if we have a matching or null selection owner
                    //nb. items inside non-owner targets are not selectable
                    if(!this.#selection.owner || this.#selection.owner === droptarget) {

                        //clear the dragitems accessible description
                        //nb. this is necessary because the selected items count might increase
                        //but the delay before accessible descriptions are updated will mean
                        //the old value is announced before that, eg. "2 items selected, 3 items selected"
                        //however, removing the description in advance of doing all that means
                        //it has no description at the point when it becomes the activedescendant
                        //and will thence only announce the updated description at the end
                        this.#undescribeDragitems(dragitems[nextindex]);

                        //update activedescendant to the next dragitem
                        this.#activeUpdate(droptarget, dragitems[nextindex]);

                        //auto-scroll the activedescendant into view, if that's necessary
                        this.#activeScroll(droptarget);

                        //select this and the previous activedescendant using contiguous multimode
                        //nb. this works with Home and End as well as with arrow keys
                        this.#doSelectionThing(droptarget, dragitems[nextindex], 2);

                        //apply accessible descriptions for the number of selected items
                        this.#describeDragitems(droptarget, this.#selection.dragitems.length);
                    }
                }

                //otherwise (if this is plain navigation and not range selection)
                //nb. this had to be separated out because contiguous selection requires that
                //the activedescendant is updated after undescribing but before range selection
                //which means that this can't happen entirely before or after that condition
                else {

                    //clear the dragitems accessible description if the next item is unselected
                    //otherwise restore the description for the number of selected items
                    //nb. this means that the number of selected items is only announced
                    //when you navigate to an already-selected item (or when it changes)
                    //which provides that information on-demand without becoming repetitive
                    if(dragitems[nextindex].getAttribute(droptarget.getAttribute('data-drag-state')) == 'false') {
                        this.#undescribeDragitems(dragitems[nextindex]);
                    }
                    else {
                        this.#describeDragitems(droptarget, this.#selection.dragitems.length);
                    }

                    //if we have a matching or null selection owner
                    //nb. items inside non-owner targets are not navigable or selectable
                    if(!this.#selection.owner || this.#selection.owner === droptarget) {

                        //implement auto-selection behavior for MacOS/Safari or locked single selection
                        //nb. VoiceOver (with a keyboard) implements an auto-selection model
                        //for listboxes, the same behavior as desktop Finder navigation
                        //and there's no way to override or stop it from doing this
                        //so the only way to make its selection announcements follow the
                        //selections, is to make the selections follow its announcements
                        //nb. this is also the model we use for [role="radio"] single selection
                        //in which selection following focus is the expected pattern
                        if(droptarget.getAttribute('data-drag-safari') == 'macos' || !this.#collection[droptarget.id].multimode) {

                            //clear the dragitems accessible description
                            this.#undescribeDragitems(dragitems[nextindex]);

                            //select this item using single selection
                            this.#doSelectionThing(droptarget, dragitems[nextindex], 0);

                            //apply accessible descriptions for the number of selected items
                            this.#describeDragitems(droptarget, this.#selection.dragitems.length);
                        }
                    }

                    //update activedescendant to the next dragitem
                    this.#activeUpdate(droptarget, dragitems[nextindex]);

                    //auto-scroll the activedescendant into view, if that's necessary
                    this.#activeScroll(droptarget);
                }
            }

            //prevent default to avoid any conflict with native actions
            e.preventDefault();
        });


        //document keydown listener
        //nb. this is on document because reset events could come from anywhere
        document.addEventListener('keydown', (e) => {

            //identify relevant event keys and ignore the rest
            //nb. lowercase all the key names so we can test letter keys without case variation
            let keyname = (this.constructor.#keynames.find((key) => key == e.key.toLowerCase()) || '').toLowerCase();
            if(!(keyname == 'escape')) {
                return;
            }

            //Escape = global abort
            //nb. JAWS users may have to press Escape twice before it's handled
            //however this is expected behavior so it shouldn't be a concern
            //<https://github.com/FreedomScientific/standards-support/issues/695>
            if(keyname == 'escape') {

                //if we have any selected items
                if(this.#selection.dragitems.length) {

                    //clear drag-valid from droptargets and remove any owner dragout class
                    this.#clearDragValid();
                    this.#selection.owner.classList.remove('dragout');

                    //set focus back on the owner if you abort from another droptarget
                    //which seemed like the most intuitive thing to do in this case
                    //nb. focus won't be affected if you abort from outside the instance
                    let droptarget = this.#getClosest(e.target);
                    if(droptarget && droptarget !== this.#selection.owner) {
                        this.#selection.owner.focus();
                    }

                    //remove accessible descriptions from all the owner items
                    this.#describeDragitems(this.#selection.owner);

                    //reset all selections
                    this.#clearSelections();

                    //prevent default only if the event was inside this scope
                    if(this.#scope.contains(e.target)) {
                        e.preventDefault();
                    }
                }
            }
        });

    }

};
