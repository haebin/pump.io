// pump/view.js
//
// Views for the pump.io client UI
//
// Copyright 2011-2012, StatusNet Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// XXX: this needs to be broken up into 3-4 smaller modules

(function(_, $, Backbone, Pump) {

    Pump.templates = {};

    Pump.TemplateError = function(template, data, err) {
        Error.captureStackTrace(this, Pump.TemplateError);
        this.name     = "TemplateError";
        this.template = template;
        this.data     = data;
        this.wrapped  = err;
        this.message  = ((_.has(template, "templateName")) ? template.templateName : "unknown-template") + ": " + err.message;
    };

    Pump.TemplateError.prototype = new Error();
    Pump.TemplateError.prototype.constructor = Pump.TemplateError;

    Pump.TemplateView = Backbone.View.extend({
        initialize: function(options) {
            var view = this;

            if (_.has(view, "model") && _.isObject(view.model)) {
                view.listenTo(view.model, "change", function(options) {
                    // When a change has happened, re-render
                    view.render();
                });
                view.listenTo(view.model, "destroy", function(options) {
                    // When a change has happened, re-render
                    view.remove();
                });
            } else if (_.has(view, "collection") && _.isObject(view.collection)) {
                view.listenTo(view.collection, "add", function(model, collection, options) {
                    view.showAdded(model);
                });
                view.listenTo(view.collection, "remove", function(model, collection, options) {
                    view.showRemoved(model);
                });
                view.listenTo(view.collection, "reset", function(collection, options) {
                    // When a change has happened, re-render
                    view.render();
                });
                view.listenTo(view.collection, "sort", function(collection, options) {
                    // When a change has happened, re-render
                    view.render();
                });
            }
        },
        setElement: function(element, delegate) {
            Backbone.View.prototype.setElement.apply(this, arguments);
            if (element) {
                this.ready();
                this.trigger("ready");
            }
        },
        templateName: null,
        parts: null,
        subs: {},
        ready: function() {
            // setup subViews
            this.setupSubs();
        },
        setupSubs: function() {

            var view = this,
                data = view.options.data,
                subs = view.subs;

            if (!subs) {
                return;
            }

            _.each(subs, function(def, selector) {

                var $el = view.$(selector),
                    options,
                    sub,
                    id;

                if (def.attr && view[def.attr]) {
                    view[def.attr].setElement($el);
                    return;
                }

                if (def.idAttr && view.collection) {

                    if (def.map) {
                        if (!view[def.map]) {
                            view[def.map] = {};
                        }
                    }

                    $el.each(function(i, el) {

                        var id = $(el).attr(def.idAttr),
                            options = {el: el};

                        if (!id) {
                            return;
                        }

                        options.model = view.collection.get(id);

                        if (!options.model) {
                            return;
                        }

                        sub = new Pump[def.subView](options);

                        if (def.map) {
                            view[def.map][id] = sub;
                        }
                    });

                    return;
                }

                options = {el: $el};

                if (def.subOptions) {
                    if (def.subOptions.model) {
                        options.model = data[def.subOptions.model];
                    }
                    if (def.subOptions.collection) {
                        options.collection = data[def.subOptions.collection];
                    }
                    if (def.subOptions.data) {
                        options.data = {};
                        _.each(def.subOptions.data, function(item) {
                            options.data[item] = data[item];
                        });
                    }
                }
                
                sub = new Pump[def.subView](options);
                
                if (def.attr) {
                    view[def.attr] = sub;
                }
            });
        },
        render: function() {
            var view = this,
                getTemplate = function(name, cb) {
                    var url;
                    if (_.has(Pump.templates, name)) {
                        cb(null, Pump.templates[name]);
                    } else {
                        $.get('/template/'+name+'.utml', function(data) {
                            var f;
                            try {
                                f = _.template(data);
                                f.templateName = name;
                                Pump.templates[name] = f;
                            } catch (err) {
                                cb(err, null);
                                return;
                            }
                            cb(null, f);
                        });
                    }
                },
                getTemplateSync = function(name) {
                    var f, data, res;
                    if (_.has(Pump.templates, name)) {
                        return Pump.templates[name];
                    } else {
                        res = $.ajax({url: '/template/'+name+'.utml',
                                      async: false});
                        if (res.readyState === 4 &&
                            ((res.status >= 200 && res.status < 300) || res.status === 304)) {
                            data = res.responseText;
                            f = _.template(data);
                            f.templateName = name;
                            Pump.templates[name] = f;
                        }
                        return f;
                    }
                },
                runTemplate = function(template, data, cb) {
                    var html;
                    try {
                        html = template(data);
                    } catch (err) {
                        cb(new Pump.TemplateError(template, data, err), null);
                        return;
                    }
                    cb(null, html);
                },
                setOutput = function(err, html) {
                    if (err) {
                        Pump.error(err);
                    } else {
                        // Triggers "ready"
                        view.setHTML(html);
                        // Update relative to the new code view
                        view.$("abbr.easydate").easydate();
                    }
                },
                main = {
                    config: Pump.config,
                    data: {},
                    template: {},
                    page: {}
                },
                pc,
                modelName = view.modelName || view.options.modelName || "model",
                partials = {},
                cnt;

            if (view.collection) {
                main.data[modelName] = view.collection.toJSON();
            } else if (view.model) {
                main.data[modelName] = (!view.model) ? {} : ((view.model.toJSON) ? view.model.toJSON() : view.model);
            }

            if (_.has(view.options, "data")) {
                _.each(view.options.data, function(obj, name) {
                    if (obj.toJSON) {
                        main.data[name] = obj.toJSON();
                    } else {
                        main.data[name] = obj;
                    }
                });
            }

            if (Pump.currentUser && !_.has(main.data, "user")) {
                main.data.user = Pump.currentUser.toJSON();
            }

            main.partial = function(name, locals) {
                var template, scoped;
                if (locals) {
                    scoped = _.clone(locals);
                    _.extend(scoped, main);
                } else {
                    scoped = main;
                }
                if (!_.has(partials, name)) {
                    console.log("Didn't preload template " + name + " so fetching sync");
                    // XXX: Put partials in the parts array of the
                    // view to avoid this shameful sync call
                    partials[name] = getTemplateSync(name);
                }
                template = partials[name];
                if (!template) {
                    throw new Error("No template for " + name);
                }
                return template(scoped);
            };

            // XXX: set main.page.title

            // If there are sub-parts, we do them in parallel then
            // do the main one. Note: only one level.

            if (view.parts) {
                pc = 0;
                cnt = _.keys(view.parts).length;
                _.each(view.parts, function(templateName) {
                    getTemplate(templateName, function(err, template) {
                        if (err) {
                            Pump.error(err);
                        } else {
                            pc++;
                            partials[templateName] = template;
                            if (pc >= cnt) {
                                getTemplate(view.templateName, function(err, template) {
                                    runTemplate(template, main, setOutput);
                                });
                            }
                        }
                    });
                });
            } else {
                getTemplate(view.templateName, function(err, template) {
                    runTemplate(template, main, setOutput);
                });
            }
            return this;
        },
        stopSpin: function() {
            this.$(':submit').prop('disabled', false).spin(false);
        },
        startSpin: function() {
            this.$(':submit').prop('disabled', true).spin(true);
        },
        showAlert: function(msg, type) {
            var view = this;

            if (view.$(".alert").length > 0) {
                view.$(".alert").remove();
            }

            type = type || "error";

            view.$("legend").after('<div class="alert alert-'+type+'">' +
                                   '<a class="close" data-dismiss="alert" href="#">&times;</a>' +
                                   '<p class="alert-message">'+ msg + '</p>' +
                                   '</div>');
            
            view.$(".alert").alert();
        },
        showError: function(msg) {
            this.showAlert(msg, "error");
        },
        showSuccess: function(msg) {
            this.showAlert(msg, "success");
        },
        setHTML: function(html) {
            var view = this,
                $old = view.$el,
                $new = $(html).first();

            $old.replaceWith($new);
            view.setElement($new);
            $old = null;
        },
        showAdded: function(model) {

            var view = this,
                id = model.get("id"),
                subs = view.subs,
                aview,
                def,
                selector;

            // Strange!

            if (!subs) {
                return;
            }

            if (!view.collection) {
                return;
            }

            // Find the first def and selector with a map

            _.each(subs, function(subDef, subSelector) {
                if (subDef.map) {
                    def = subDef;
                    selector = subSelector;
                }
            });

            if (!def) {
                return;
            }

            if (!view[def.map]) {
                view[def.map] = {};
            }

            // If we already have it, skip

            if (_.has(view[def.map], id)) {
                return;
            }

            // Show the new item

            aview = new Pump[def.subView]({model: model});

            // Stash the view

            view[def.map][model.id] = aview;

            // When it's rendered, stick it where it goes

            aview.on("ready", function() {

                var idx, $el = view.$(selector);
                
                aview.$el.hide();

                idx = view.collection.indexOf(model);

                if (idx <= 0) {
                    view.$el.prepend(aview.$el);
                } else if (idx >= $el.length) {
                    view.$el.append(aview.$el);
                } else {
                    aview.$el.insertBefore($el[idx]);
                }

                aview.$el.fadeIn('slow');
            });

            aview.render();
        },
        showRemoved: function(model) {
            var view = this,
                id = model.get("id"),
                aview,
                def,
                selector,
                subs = view.subs;

            // Possible but not likely

            if (!subs) {
                return;
            }

            if (!view.collection) {
                return;
            }

            // Find the first def and selector with a map

            _.each(subs, function(subDef, subSelector) {
                if (subDef.map) {
                    def = subDef;
                    selector = subSelector;
                }
            });

            if (!def) {
                return;
            }

            if (!view[def.map]) {
                view[def.map] = {};
            }

            if (!_.has(view[def.map], id)) {
                return;
            }

            // Remove it from the DOM

            view[def.map][id].remove();

            // delete that view from our map

            delete view[def.map][id];
        }
    });

    Pump.AnonymousNav = Pump.TemplateView.extend({
        tagName: "div",
        className: "container",
        templateName: 'nav-anonymous'
    });

    Pump.UserNav = Pump.TemplateView.extend({
        tagName: "div",
        className: "container",
        modelName: "user",
        templateName: 'nav-loggedin',
        parts: ["messages",
                "notifications"],
        subs: {
            "#messages": {
                attr: "majorStreamView",
                subView: "MessagesView",
                subOptions: {
                    collection: "messages"
                }
            },
            "#notifications": {
                attr: "minorStreamView",
                subView: "NotificationsView",
                subOptions: {
                    collection: "notifications"
                }
            }
        },
        events: {
            "click #logout": "logout",
            "click #post-note-button": "postNoteModal",
            "click #post-picture-button": "postPictureModal",
            "click #profile-dropdown": "profileDropdown"
        },
        postNoteModal: function() {
            var profile = Pump.currentUser.profile,
                lists = profile.lists,
                following = profile.following;

            Pump.fetchObjects([lists, following], function(objs) {
                Pump.showModal(Pump.PostNoteModal, {data: {user: Pump.currentUser}});
            });

            return false;
        },
        postPictureModal: function() {
            var profile = Pump.currentUser.profile,
                lists = profile.lists,
                following = profile.following;

            Pump.fetchObjects([lists, following], function(objs) {
                Pump.showModal(Pump.PostPictureModal, {data: {user: Pump.currentUser}});
            });
            return false;
        },
        profileDropdown: function() {
            $('#profile-dropdown').dropdown();
        },
        logout: function() {
            var view = this,
                options,
                onSuccess = function(data, textStatus, jqXHR) {
                    var an;
                    Pump.currentUser = null;

                    Pump.setNickname(null);
                    Pump.setUserCred(null, null);

                    Pump.clearCaches();

                    an = new Pump.AnonymousNav({el: ".navbar-inner .container"});
                    an.render();

                    if (Pump.config.sockjs) {
                        // Request a new challenge
                        Pump.setupSocket();
                    }

                    // Reload to clear authenticated stuff

                    Pump.router.navigate(window.location.pathname+"?logout=true", true);
                },
                onError = function(jqXHR, textStatus, errorThrown) {
                    showError(errorThrown);
                },
                showError = function(msg) {
                    Pump.error(msg);
                };

            options = {
                contentType: "application/json",
                data: "",
                dataType: "json",
                type: "POST",
                url: "/main/logout",
                success: onSuccess,
                error: onError
            };

            Pump.ajax(options);
        }
    });

    Pump.MessagesView = Pump.TemplateView.extend({
        templateName: "messages",
        modelName: "messages"
    });

    Pump.NotificationsView = Pump.TemplateView.extend({
        templateName: "notifications",
        modelName: "notifications"
    });

    Pump.ContentView = Pump.TemplateView.extend({
        addMajorActivity: function(act) {
            // By default, do nothing
        },
        addMinorActivity: function(act) {
            // By default, do nothing
        }
    });

    Pump.MainContent = Pump.ContentView.extend({
        templateName: 'main'
    });

    Pump.LoginContent = Pump.ContentView.extend({
        templateName: 'login',
        events: {
            "submit #login": "doLogin"
        },
        "doLogin": function() {
            var view = this,
                params = {nickname: view.$('#login input[name="nickname"]').val(),
                          password: view.$('#login input[name="password"]').val()},
                options,
                continueTo = Pump.getContinueTo(),
                NICKNAME_RE = /^[a-zA-Z0-9\-_.]{1,64}$/,
                onSuccess = function(data, textStatus, jqXHR) {
                    var objs;
                    Pump.setNickname(data.nickname);
                    Pump.setUserCred(data.token, data.secret);
                    Pump.clearCaches();
                    Pump.currentUser = Pump.User.unique(data);
                    objs = [Pump.currentUser,
                            Pump.currentUser.majorDirectInbox,
                            Pump.currentUser.minorDirectInbox];
                    Pump.fetchObjects(objs, function(objs) {
                        Pump.body.nav = new Pump.UserNav({el: ".navbar-inner .container",
                                                          model: Pump.currentUser,
                                                          data: {
                                                              messages: Pump.currentUser.majorDirectInbox,
                                                              notifications: Pump.currentUser.minorDirectInbox
                                                          }});
                        Pump.body.nav.render();
                    });
                    if (Pump.config.sockjs) {
                        // Request a new challenge
                        Pump.setupSocket();
                    }
                    // XXX: reload current data
                    view.stopSpin();
                    Pump.router.navigate(continueTo, true);
                },
                onError = function(jqXHR, textStatus, errorThrown) {
                    var type, response;
                    view.stopSpin();
                    type = jqXHR.getResponseHeader("Content-Type");
                    if (type && type.indexOf("application/json") !== -1) {
                        response = JSON.parse(jqXHR.responseText);
                        view.showError(response.error);
                    } else {
                        view.showError(errorThrown);
                    }
                };

            view.startSpin();

            options = {
                contentType: "application/json",
                data: JSON.stringify(params),
                dataType: "json",
                type: "POST",
                url: "/main/login",
                success: onSuccess,
                error: onError
            };

            Pump.ajax(options);

            return false;
        }
    });

    Pump.RegisterContent = Pump.ContentView.extend({
        templateName: 'register',
        events: {
            "submit #registration": "register"
        },
        register: function() {
            var view = this,
                params = {nickname: view.$('#registration input[name="nickname"]').val(),
                          password: view.$('#registration input[name="password"]').val()},
                repeat = view.$('#registration input[name="repeat"]').val(),
                email = (Pump.config.requireEmail) ? view.$('#registration input[name="email"]').val() : null,
                options,
                NICKNAME_RE = /^[a-zA-Z0-9\-_.]{1,64}$/,
                onSuccess = function(data, textStatus, jqXHR) {
                    var objs;
                    Pump.setNickname(data.nickname);
                    Pump.setUserCred(data.token, data.secret);
                    Pump.clearCaches();
                    Pump.currentUser = Pump.User.unique(data);
                    if (Pump.config.sockjs) {
                        // Request a new challenge
                        Pump.setupSocket();
                    }
                    objs = [Pump.currentUser,
                            Pump.currentUser.majorDirectInbox,
                            Pump.currentUser.minorDirectInbox];
                    Pump.fetchObjects(objs, function(objs) {
                        Pump.body.nav = new Pump.UserNav({el: ".navbar-inner .container",
                                                          model: Pump.currentUser,
                                                          data: {
                                                              messages: Pump.currentUser.majorDirectInbox,
                                                              notifications: Pump.currentUser.minorDirectInbox
                                                          }});
                        Pump.body.nav.render();
                    });
                    Pump.body.nav.render();
                    // Leave disabled
                    view.stopSpin();
                    // XXX: one-time on-boarding page
                    Pump.router.navigate("", true);
                },
                onError = function(jqXHR, textStatus, errorThrown) {
                    var type, response;
                    view.stopSpin();
                    type = jqXHR.getResponseHeader("Content-Type");
                    if (type && type.indexOf("application/json") !== -1) {
                        response = JSON.parse(jqXHR.responseText);
                        view.showError(response.error);
                    } else {
                        view.showError(errorThrown);
                    }
                };

            if (params.password !== repeat) {

                view.showError("Passwords don't match.");

            } else if (!NICKNAME_RE.test(params.nickname)) {

                view.showError("Nicknames have to be a combination of 1-64 letters or numbers and ., - or _.");

            } else if (params.password.length < 8) {

                view.showError("Password must be 8 chars or more.");

            } else if (/^[a-z]+$/.test(params.password.toLowerCase()) ||
                       /^[0-9]+$/.test(params.password)) {

                view.showError("Passwords have to have at least one letter and one number.");

            } else if (Pump.config.requireEmail && (!email || email.length === 0)) {

                view.showError("Email address required.");

            } else {

                if (Pump.config.requireEmail) {
                    params.email = email;
                }

                view.startSpin();

                options = {
                    contentType: "application/json",
                    data: JSON.stringify(params),
                    dataType: "json",
                    type: "POST",
                    url: "/main/register",
                    success: onSuccess,
                    error: onError
                };

                Pump.ensureCred(function(err, cred) {
                    if (err) {
                        view.showError("Couldn't get OAuth credentials. :(");
                    } else {
                        options.consumerKey = cred.clientID;
                        options.consumerSecret = cred.clientSecret;
                        options = Pump.oauthify(options);
                        $.ajax(options);
                    }
                });
            }

            return false;
        }
    });

    Pump.UserPageContent = Pump.ContentView.extend({
        templateName: 'user',
        parts: ["profile-block",
                "user-content-activities",
                "major-stream-headless",
                "minor-stream-headless",
                "major-activity-headless",
                "minor-activity-headless",
                "responses",
                "reply",
                "profile-responses",
                "activity-object-list",
                "activity-object-collection"
               ],
        addMajorActivity: function(act) {
            var view = this,
                profile = this.options.data.profile;

            if (!profile || act.actor.id != profile.get("id")) {
                return;
            }

            view.userContent.majorStreamView.showAdded(act);
        },
        addMinorActivity: function(act) {
            var view = this,
                profile = this.options.data.profile;

            if (!profile || act.actor.id != profile.get("id")) {
                return;
            }

            view.userContent.minorStreamView.showAdded(act);
        },
        subs: {
            "#profile-block": {
                attr: "profileBlock",
                subView: "ProfileBlock",
                subOptions: {
                    model: "profile"
                }
            },
            "#user-content-activities": {
                attr: "userContent",
                subView: "ActivitiesUserContent",
                subOptions: {
                    data: ["major", "minor"]
                }
            }
        }
    });

    Pump.ActivitiesUserContent = Pump.TemplateView.extend({
        templateName: 'user-content-activities',
        parts: ["major-stream-headless",
                "minor-stream-headless",
                "major-activity-headless",
                "minor-activity-headless",
                "responses",
                "reply",
                "profile-responses",
                "activity-object-list",
                "activity-object-collection"],
        subs: {
            "#major-stream": {
                attr: "majorStreamView",
                subView: "MajorStreamHeadlessView",
                subOptions: {
                    collection: "major"
                }
            },
            "#minor-stream": {
                attr: "minorStreamView",
                subView: "MinorStreamHeadlessView",
                subOptions: {
                    collection: "minor"
                }
            }
        }
    });

    Pump.MajorStreamHeadlessView = Pump.TemplateView.extend({
        templateName: 'major-stream-headless',
        modelName: 'major',
        parts: ["major-activity-headless",
                "responses",
                "reply",
                "activity-object-list",
                "activity-object-collection"],
        subs: {
            ".activity.major": {
                map: "activities",
                subView: "MajorActivityHeadlessView",
                idAttr: "data-activity-id"
            }
        }
    });

    Pump.MinorStreamHeadlessView = Pump.TemplateView.extend({
        templateName: 'minor-stream-headless',
        modelName: 'minor',
        parts: ["minor-activity-headless"],
        subs: {
            ".activity.minor": {
                map: "activities",
                subView: "MinorActivityHeadlessView",
                idAttr: "data-activity-id"
            }
        }
    });

    Pump.MajorStreamView = Pump.TemplateView.extend({
        templateName: 'major-stream',
        modelName: 'major',
        parts: ["major-activity",
                "responses",
                "reply",
                "activity-object-list",
                "activity-object-collection"],
        subs: {
            ".activity.major": {
                map: "activities",
                subView: "MajorActivityView",
                idAttr: "data-activity-id"
            }
        }
    });

    Pump.MinorStreamView = Pump.TemplateView.extend({
        templateName: 'minor-stream',
        modelName: 'minor',
        parts: ["minor-activity"],
        subs: {
            ".activity.minor": {
                map: "activities",
                subView: "MinorActivityView",
                idAttr: "data-activity-id"
            }
        }
    });

    Pump.InboxContent = Pump.ContentView.extend({
        templateName: 'inbox',
        parts: ["major-stream",
                "minor-stream",
                "major-activity",
                "minor-activity",
                "responses",
                "reply",
                "activity-object-list",
                "activity-object-collection"],
        addMajorActivity: function(act) {
            var view = this;
            view.majorStreamView.showAdded(act);
        },
        addMinorActivity: function(act) {
            var view = this,
                aview;
            view.minorStreamView.showAdded(act);
        },
        subs: {
            "#major-stream": {
                attr: "majorStreamView",
                subView: "MajorStreamView",
                subOptions: {
                    collection: "major"
                }
            },
            "#minor-stream": {
                attr: "minorStreamView",
                subView: "MinorStreamView",
                subOptions: {
                    collection: "minor"
                }
            }
        }
    });

    Pump.MajorActivityView = Pump.TemplateView.extend({
        templateName: 'major-activity',
        parts: ["responses",
                "reply"],
        modelName: "activity",
        events: {
            "click .favorite": "favoriteObject",
            "click .unfavorite": "unfavoriteObject",
            "click .share": "shareObject",
            "click .unshare": "unshareObject",
            "click .comment": "openComment"
        },
        favoriteObject: function() {
            var view = this,
                act = new Pump.Activity({
                    verb: "favorite",
                    object: view.model.object.toJSON()
                }),
                stream = Pump.currentUser.minorStream;

            stream.create(act, {success: function(act) {
                view.$(".favorite")
                    .removeClass("favorite")
                    .addClass("unfavorite")
                    .html("Unlike <i class=\"icon-thumbs-down\"></i>");
                Pump.addMinorActivity(act);
            }});
        },
        unfavoriteObject: function() {
            var view = this,
                act = new Pump.Activity({
                    verb: "unfavorite",
                    object: view.model.object.toJSON()
                }),
                stream = Pump.currentUser.minorStream;

            stream.create(act, {success: function(act) {
                view.$(".unfavorite")
                    .removeClass("unfavorite")
                    .addClass("favorite")
                    .html("Like <i class=\"icon-thumbs-up\"></i>");
                Pump.addMinorActivity(act);
            }});
        },
        shareObject: function() {
            var view = this,
                act = new Pump.Activity({
                    verb: "share",
                    object: view.model.object.toJSON()
                }),
                stream = Pump.currentUser.majorStream;

            stream.create(act, {success: function(act) {
                view.$(".share")
                    .removeClass("share")
                    .addClass("unshare")
                    .html("Unshare <i class=\"icon-remove\"></i>");
                Pump.addMajorActivity(act);
            }});
        },
        unshareObject: function() {
            var view = this,
                act = new Pump.Activity({
                    verb: "unshare",
                    object: view.model.object.toJSON()
                }),
                stream = Pump.currentUser.minorStream;

            stream.create(act, {success: function(act) {
                view.$(".unshare")
                    .removeClass("unshare")
                    .addClass("share")
                    .html("Share <i class=\"icon-share-alt\"></i>");
                Pump.addMinorActivity(act);
            }});
        },
        openComment: function() {
            var view = this,
                form;

            if (view.$("form.post-comment").length > 0) {
                view.$("form.post-comment textarea").focus();
            } else {
                form = new Pump.CommentForm({original: view.model.object});
                form.on("ready", function() {
                    view.$(".replies").append(form.$el);
                });
                form.render();
            }
        }
    });

    // For the user page

    Pump.MajorActivityHeadlessView = Pump.MajorActivityView.extend({
        template: "major-activity-headless"
    });

    Pump.CommentForm = Pump.TemplateView.extend({
        templateName: 'comment-form',
        tagName: "div",
        className: "row comment-form",
        events: {
            "submit .post-comment": "saveComment"
        },
        saveComment: function() {
            var view = this,
                text = view.$('textarea[name="content"]').val(),
                orig = view.options.original,
                act = new Pump.Activity({
                    verb: "post",
                    object: {
                        objectType: "comment",
                        content: text,
                        inReplyTo: {
                            objectType: orig.get("objectType"),
                            id: orig.get("id")
                        }
                    }
                }),
                stream = Pump.currentUser.minorStream;

            view.startSpin();

            stream.create(act, {success: function(act) {

                var object = act.object,
                    repl;

                object.set("author", act.actor); 

                repl = new Pump.ReplyView({model: object});

                // These get stripped for "posts"; re-add it

                repl.on("ready", function() {

                    view.stopSpin();

                    view.$el.replaceWith(repl.$el);
                });

                repl.render();

                Pump.addMinorActivity(act);

            }});

            return false;
        }
    });

    Pump.MajorObjectView = Pump.TemplateView.extend({
        templateName: 'major-object',
        parts: ["responses", "reply"]
    });

    Pump.ReplyView = Pump.TemplateView.extend({
        templateName: 'reply',
        modelName: 'reply'
    });

    Pump.MinorActivityView = Pump.TemplateView.extend({
        templateName: 'minor-activity',
        modelName: "activity"
    });

    Pump.MinorActivityHeadlessView = Pump.MinorActivityView.extend({
        templateName: 'minor-activity-headless'
    });

    Pump.PersonView = Pump.TemplateView.extend({
        events: {
            "click .follow": "followProfile",
            "click .stop-following": "stopFollowingProfile"
        },
        followProfile: function() {
            var view = this,
                act = {
                    verb: "follow",
                    object: view.model.toJSON()
                },
                stream = Pump.currentUser.stream;

            stream.create(act, {success: function(act) {
                view.$(".follow")
                    .removeClass("follow")
                    .removeClass("btn-primary")
                    .addClass("stop-following")
                    .html("Stop following");
            }});
        },
        stopFollowingProfile: function() {
            var view = this,
                act = {
                    verb: "stop-following",
                    object: view.model.toJSON()
                },
                stream = Pump.currentUser.stream;

            stream.create(act, {success: function(act) {
                view.$(".stop-following")
                    .removeClass("stop-following")
                    .addClass("btn-primary")
                    .addClass("follow")
                    .html("Follow");
            }});
        }
    });

    Pump.MajorPersonView = Pump.PersonView.extend({
        templateName: 'major-person',
        modelName: 'person'
    });

    Pump.ProfileBlock = Pump.PersonView.extend({
        templateName: 'profile-block',
        modelName: 'profile'
    });

    Pump.FavoritesContent = Pump.ContentView.extend({
        templateName: 'favorites',
        parts: ["profile-block",
                "user-content-favorites",
                "object-stream",
                "major-object",
                "responses",
                "reply",
                "profile-responses",
                "activity-object-list",
                "activity-object-collection"],
        subs: {
            "#profile-block": {
                attr: "profileBlock",
                subView: "ProfileBlock",
                subOptions: {
                    model: "profile"
                }
            },
            "#user-content-favorites": {
                attr: "userContent",
                subView: "FavoritesUserContent",
                subOptions: {
                    collection: "objects",
                    data: ["profile"]
                }
            }
        }
    });

    Pump.FavoritesUserContent = Pump.TemplateView.extend({
        templateName: 'user-content-favorites',
        modelName: "objects",
        parts: ["object-stream",
                "major-object",
                "responses",
                "reply",
                "profile-responses",
                "activity-object-collection"],
        subs: {
            ".object.major": {
                map: "objects",
                subView: "MajorObjectView",
                idAttr: "data-object-id"
            }
        }
    });

    Pump.FollowersContent = Pump.ContentView.extend({
        templateName: 'followers',
        parts: ["profile-block",
                "user-content-followers",
                "people-stream",
                "major-person",
                "profile-responses"],
        subs: {
            "#profile-block": {
                attr: "profileBlock",
                subView: "ProfileBlock",
                subOptions: {
                    model: "profile"
                }
            },
            "#user-content-followers": {
                attr: "userContent",
                subView: "FollowersUserContent",
                subOptions: {
                    collection: "people",
                    data: ["profile"]
                }
            }
        }
    });

    Pump.FollowersUserContent = Pump.TemplateView.extend({
        templateName: 'user-content-followers',
        modelName: "people",
        parts: ["people-stream",
                "major-person",
                "profile-responses"],
        subs: {
            ".person.major": {
                map: "people",
                subView: "MajorPersonView",
                idAttr: "data-person-id"
            }
        }
    });

    Pump.FollowingContent = Pump.ContentView.extend({
        templateName: 'following',
        parts: ["profile-block",
                'user-content-following',
                "people-stream",
                "major-person",
                "profile-responses"],
        subs: {
            "#profile-block": {
                attr: "profileBlock",
                subView: "ProfileBlock",
                subOptions: {
                    model: "profile"
                }
            },
            "#user-content-following": {
                attr: "userContent",
                subView: "FollowingUserContent",
                subOptions: {
                    collection: "people",
                    data: ["profile"]
                }
            }
        }
    });

    Pump.FollowingUserContent = Pump.TemplateView.extend({
        templateName: 'user-content-following',
        modelName: "people",
        parts: ["people-stream",
                "major-person",
                "profile-responses"],
        subs: {
            ".person.major": {
                map: "people",
                subView: "MajorPersonView",
                idAttr: "data-person-id"
            }
        }
    });

    Pump.ListsContent = Pump.ContentView.extend({
        templateName: 'lists',
        parts: ["profile-block",
                'user-content-lists',
                "list-menu",
                "list-menu-item",
                "profile-responses"],
        subs: {
            "#profile-block": {
                attr: "profileBlock",
                subView: "ProfileBlock",
                subOptions: {
                    model: "profile"
                }
            },
            "#user-content-lists": {
                attr: "userContent",
                subView: "ListsUserContent",
                subOptions: {
                    data: ["profile", "lists"]
                }
            }
        }
    });

    Pump.ListsUserContent = Pump.TemplateView.extend({
        templateName: 'user-content-lists',
        parts: ["list-menu",
                "list-menu-item",
                "list-content-lists"],
        subs: {
            "#list-menu-inner": {
                attr: "listMenu",
                subView: "ListMenu",
                subOptions: {
                    collection: "lists",
                    data: ["profile"]
                }
            }
        }
    });

    Pump.ListMenu = Pump.TemplateView.extend({
        templateName: "list-menu",
        modelName: "profile",
        parts: ["list-menu-item"],
        el: '.list-menu-block',
        events: {
            "click .new-list": "newList"
        },
        newList: function() {
            Pump.showModal(Pump.NewListModal, {data: {user: Pump.currentUser}});
        },
        subs: {
            ".list": {
                map: "lists",
                subView: "ListMenuItem",
                idAttr: "data-list-id"
            }
        }
    });

    Pump.ListMenuItem = Pump.TemplateView.extend({
        templateName: "list-menu-item",
        modelName: "listItem",
        tagName: "ul",
        className: "list-menu-wrapper"
    });

    Pump.ListsListContent = Pump.TemplateView.extend({
        templateName: 'list-content-lists'
    });

    Pump.ListContent = Pump.ContentView.extend({
        templateName: 'list',
        parts: ["profile-block",
                "profile-responses",
                'user-content-list',
                "list-content-list",
                "people-stream",
                "major-person",
                "list-menu",
                "list-menu-item"
               ],
        subs: {
            "#profile-block": {
                attr: "profileBlock",
                subView: "ProfileBlock",
                subOptions: {
                    model: "profile"
                }
            },
            "#user-content-list": {
                attr: "userContent",
                subView: "ListUserContent",
                subOptions: {
                    data: ["profile", "lists", "list"]
                }
            }
        }
    });

    Pump.ListUserContent = Pump.TemplateView.extend({
        templateName: 'user-content-list',
        parts: ["people-stream",
                "list-content-list",
                "major-person",
                "list-menu-item",
                "list-menu"
               ],
        subs: {
            "#list-menu-inner": {
                attr: "listMenu",
                subView: "ListMenu",
                subOptions: {
                    collection: "lists",
                    data: ["profile"]
                }
            },
            "#list-content-list": {
                attr: "listContent",
                subView: "ListListContent",
                subOptions: {
                    model: "list",
                    data: ["profile"]
                }
            }
        }
    });

    Pump.ListListContent = Pump.TemplateView.extend({
        templateName: 'list-content-list',
        modelName: "list",
        parts: ["people-stream",
                "major-person"],
        setupSubs: function() {
            var view = this,
                model = view.model;

            if (model && model.members) {
                model.members.each(function(person) {
                    var $el = view.$("div[data-person-id='"+person.id+"']"),
                        aview;

                    if ($el.length > 0) {
                        aview = new Pump.MajorPersonView({el: $el,
                                                          model: person});
                    }
                });
            }
        }
    });

    Pump.SettingsContent = Pump.ContentView.extend({
        templateName: 'settings',
        modelName: "profile",
        events: {
            "submit #settings": "saveSettings"
        },
        saveSettings: function() {

            var view = this,
                user = Pump.currentUser,
                profile = user.profile;

            view.startSpin();

            profile.save({"displayName": this.$('#realname').val(),
                          "location": { objectType: "place", 
                                        displayName: this.$('#location').val() },
                          "summary": this.$('#bio').val()},
                         {
                             success: function(resp, status, xhr) {
                                 user.set("profile", profile);
                                 view.showSuccess("Saved settings.");
                                 view.stopSpin();
                             },
                             error: function(model, error, options) {
                                 view.showError(error.message);
                                 view.stopSpin();
                             }
                         });

            return false;
        }
    });

    Pump.AccountContent = Pump.ContentView.extend({
        templateName: 'account',
        modelName: "user",
        events: {
            "submit #account": "saveAccount"
        },
        saveAccount: function() {
            var view = this,
                user = Pump.currentUser,
                password = view.$('#password').val(),
                repeat = view.$('#repeat').val();

            if (password !== repeat) {

                view.showError("Passwords don't match.");

            } else if (password.length < 8) {

                view.showError("Password must be 8 chars or more.");

            } else if (/^[a-z]+$/.test(password.toLowerCase()) ||
                       /^[0-9]+$/.test(password)) {

                view.showError("Passwords have to have at least one letter and one number.");

            } else {

                view.startSpin();

                user.save("password",
                          password,
                          {
                              success: function(resp, status, xhr) {
                                  view.showSuccess("Saved.");
                                  view.stopSpin();
                              },
                              error: function(model, error, options) {
                                  view.showError(error.message);
                                  view.stopSpin();
                              }
                          }
                         );
            }
            
            return false;
        }
    });

    Pump.AvatarContent = Pump.ContentView.extend({
        templateName: "avatar",
        modelName: "profile",
        ready: function() {
            var view = this;
            view.setupSubs();

            if (view.$("#avatar-fineupload").length > 0) {
                view.$("#avatar-fineupload").fineUploader({
                    request: {
                        endpoint: "/main/upload"
                    },
                    text: {
                        uploadButton: '<i class="icon-upload icon-white"></i> Avatar file'
                    },
                    template: '<div class="qq-uploader">' +
                        '<pre class="qq-upload-drop-area"><span>{dragZoneText}</span></pre>' +
                        '<div class="qq-upload-button btn btn-success">{uploadButtonText}</div>' +
                        '<ul class="qq-upload-list"></ul>' +
                        '</div>',
                    classes: {
                        success: 'alert alert-success',
                        fail: 'alert alert-error'
                    },
                    multiple: false,
                    validation: {
                        allowedExtensions: ["jpeg", "jpg", "png", "gif", "svg", "svgz"],
                        acceptFiles: "image/*"
                    }
                }).on("complete", function(event, id, fileName, responseJSON) {

                    var stream = Pump.currentUser.majorStream,
                        strToObj = function(str) {
                            var colon = str.indexOf(":"),
                                type = str.substr(0, colon),
                                id = str.substr(colon+1);
                            return new Pump.ActivityObject({
                                id: id,
                                objectType: type
                            });
                        },
                        act = new Pump.Activity({
                            verb: "post",
                            cc: [{id: "http://activityschema.org/collection/public",
                                  objectType: "collection"}],
                            object: responseJSON.obj
                        });

                    view.startSpin();

                    stream.create(act, {success: function(act) {
                        var profile = Pump.currentUser.profile;
                        profile.save({"image": act.object.get("fullImage")},
                                     {
                                         success: function(resp, status, xhr) {
                                             view.showSuccess("Saved avatar.");
                                             view.stopSpin();
                                         },
                                         error: function(model, error, options) {
                                             view.showError(error.message);
                                             view.stopSpin();
                                         }
                                     });
                    }});
                }).on("error", function(event, id, fileName, reason) {
                    view.showError(reason);
                });
            }
            
        }
    });

    Pump.ObjectContent = Pump.ContentView.extend({
        templateName: 'object',
        modelName: "object",
        parts: ["responses",
                "reply",
                "activity-object-collection"]
    });

    Pump.PostNoteModal = Pump.TemplateView.extend({

        tagName: "div",
        className: "modal-holder",
        templateName: 'post-note',
        ready: function() {
            var view = this;
            view.$('#note-content').wysihtml5({
                customTemplates: Pump.wysihtml5Tmpl
            });
            view.$("#note-to").select2();
            view.$("#note-cc").select2();
        },
        events: {
            "click #send-note": "postNote"
        },
        postNote: function(ev) {
            var view = this,
                text = view.$('#post-note #note-content').val(),
                to = view.$('#post-note #note-to').val(),
                cc = view.$('#post-note #note-cc').val(),
                act = new Pump.Activity({
                    verb: "post",
                    object: {
                        objectType: "note",
                        content: text
                    }
                }),
                stream = Pump.currentUser.majorStream,
                strToObj = function(str) {
                    var colon = str.indexOf(":"),
                        type = str.substr(0, colon),
                        id = str.substr(colon+1);
                    return new Pump.ActivityObject({
                        id: id,
                        objectType: type
                    });
                };

            if (to && to.length > 0) {
                act.to = new Pump.ActivityObjectBag(_.map(to, strToObj));
            }

            if (cc && cc.length > 0) {
                act.cc = new Pump.ActivityObjectBag(_.map(cc, strToObj));
            }

            view.startSpin();
            
            stream.create(act, {success: function(act) {
                view.$el.modal('hide');
                view.stopSpin();
                Pump.resetWysihtml5(view.$('#note-content'));
                // Reload the current page
                Pump.addMajorActivity(act);
            }});
        }
    });

    Pump.PostPictureModal = Pump.TemplateView.extend({
        tagName: "div",
        className: "modal-holder",
        templateName: 'post-picture',
        events: {
            "click #send-picture": "postPicture"
        },
        ready: function() {
            var view = this;

            view.$("#picture-to").select2();
            view.$("#picture-cc").select2();

            view.$('#picture-description').wysihtml5({
                customTemplates: Pump.wysihtml5Tmpl
            });

            if (view.$("#picture-fineupload").length > 0) {
                view.$("#picture-fineupload").fineUploader({
                    request: {
                        endpoint: "/main/upload"
                    },
                    text: {
                        uploadButton: '<i class="icon-upload icon-white"></i> Picture file'
                    },
                    template: '<div class="qq-uploader">' +
                        '<pre class="qq-upload-drop-area"><span>{dragZoneText}</span></pre>' +
                        '<div class="qq-upload-button btn btn-success">{uploadButtonText}</div>' +
                        '<ul class="qq-upload-list"></ul>' +
                        '</div>',
                    classes: {
                        success: 'alert alert-success',
                        fail: 'alert alert-error'
                    },
                    autoUpload: false,
                    multiple: false,
                    validation: {
                        allowedExtensions: ["jpeg", "jpg", "png", "gif", "svg", "svgz"],
                        acceptFiles: "image/*"
                    }
                }).on("complete", function(event, id, fileName, responseJSON) {

                    var stream = Pump.currentUser.majorStream,
                        to = view.$('#post-picture #picture-to').val(),
                        cc = view.$('#post-picture #picture-cc').val(),
                        strToObj = function(str) {
                            var colon = str.indexOf(":"),
                                type = str.substr(0, colon),
                                id = str.substr(colon+1);
                            return new Pump.ActivityObject({
                                id: id,
                                objectType: type
                            });
                        },
                        act = new Pump.Activity({
                            verb: "post",
                            object: responseJSON.obj
                        });

                    if (to && to.length > 0) {
                        act.to = new Pump.ActivityObjectBag(_.map(to, strToObj));
                    }

                    if (cc && cc.length > 0) {
                        act.cc = new Pump.ActivityObjectBag(_.map(cc, strToObj));
                    }

                    stream.create(act, {success: function(act) {
                        view.$el.modal('hide');
                        view.stopSpin();
                        view.$("#picture-fineupload").fineUploader('reset');
                        Pump.resetWysihtml5(view.$('#picture-description'));
                        view.$('#picture-title').val("");
                        // Reload the current content
                        Pump.addMajorActivity(act);
                    }});
                }).on("error", function(event, id, fileName, reason) {
                    view.showError(reason);
                });
            }
        },
        postPicture: function(ev) {
            var view = this,
                description = view.$('#post-picture #picture-description').val(),
                title = view.$('#post-picture #picture-title').val(),
                params = {};

            if (title) {
                params.title = title;
            }

            // XXX: HTML

            if (description) {
                params.description = description;
            }

            view.$("#picture-fineupload").fineUploader('setParams', params);

            view.startSpin();

            view.$("#picture-fineupload").fineUploader('uploadStoredFiles');

        }
    });

    Pump.NewListModal = Pump.TemplateView.extend({

        tagName: "div",
        className: "modal-holder",
        templateName: 'new-list',
        ready: function() {
            var view = this;
            view.$('#list-description').wysihtml5({
                customTemplates: Pump.wysihtml5Tmpl
            });
        },
        events: {
            "click #save-new-list": "saveNewList"
        },
        saveNewList: function() {
            var view = this,
                description = view.$('#new-list #list-description').val(),
                name = view.$('#new-list #list-name').val(),
                act,
                stream = Pump.currentUser.minorStream;

            if (!name) {
                view.showError("Your list must have a name.");
            } else {

                // XXX: any other validation? Check uniqueness here?

                // XXX: to/cc ?

                act = new Pump.Activity({
                    verb: "create",
                    object: new Pump.ActivityObject({
                        objectType: "collection",
                        objectTypes: ["person"],
                        displayName: name,
                        content: description
                    })
                });
                
                view.startSpin();

                stream.create(act, {success: function(act) {
                    var aview;

                    view.$el.modal('hide');
                    view.stopSpin();
                    Pump.resetWysihtml5(view.$('#list-description'));
                    view.$('#list-name').val("");

                    // it's minor

                    Pump.addMinorActivity(act);

                    if ($("#list-menu-inner").length > 0) {
                        aview = new Pump.ListMenuItem({model: act.object});
                        aview.on("ready", function() {
                            var el = aview.$("li");
                            el.hide();
                            $("#list-menu-inner").prepend(el);
                            el.slideDown('fast');
                            // Go to the new list page
                            Pump.router.navigate(act.object.get("url"), true);
                        });
                        aview.render();
                    }
                }});
            }

            return false;
        }
    });

    Pump.BodyView = Backbone.View.extend({
        initialize: function(options) {
            _.bindAll(this, "navigateToHref");
        },
        el: "body",
        events: {
            "click a": "navigateToHref"
        },
        navigateToHref: function(ev) {
            var el = (ev.srcElement || ev.currentTarget),
                pathname = el.pathname, // XXX: HTML5
                here = window.location;

            if (!el.host || el.host === here.host) {
                try {
                    Pump.router.navigate(pathname, true);
                } catch (e) {
                    Pump.error(e);
                }
                // Always return false
                return false;
            } else {
                return true;
            }
        },
        setTitle: function(title) {
            this.$("title").html(title + " - " + Pump.config.site);
        },
        setContent: function(options, callback) {

            var View = options.contentView,
                title = options.title,
                body = this,
                oldContent = body.content,
                userContentOptions,
                listContentOptions,
                newView,
                parent,
                profile;

            if (options.model) {
                profile = options.model;
            } else if (options.data) {
                profile = options.data.profile;
            }

            Pump.unfollowStreams();

            // XXX: double-check this

            body.content = new View(options);

            // We try and only update the parts that have changed

            if (oldContent &&
                options.userContentView &&
                oldContent.profileBlock &&
                oldContent.profileBlock.model.get("id") == profile.get("id")) {

                body.content.profileBlock = oldContent.profileBlock;

                if (options.userContentCollection) {
                    userContentOptions = _.extend({collection: options.userContentCollection}, options);
                } else {
                    userContentOptions = options;
                }

                body.content.userContent = new options.userContentView(userContentOptions);

                if (options.listContentView &&
                    oldContent.userContent.listMenu) {

                    body.content.userContent.listMenu = oldContent.userContent.listMenu;
                    if (options.listContentModel) {
                        listContentOptions = _.extend({model: options.listContentModel}, options);
                    } else {
                        listContentOptions = options;
                    }

                    body.content.userContent.listContent = new options.listContentView(listContentOptions);
                    parent = "#list-content";
                    newView = body.content.userContent.listContent;

                } else {
                    parent = "#user-content";
                    newView = body.content.userContent;
                }
            } else {
                parent = "#content";
                newView = body.content;
            }

            newView.once("ready", function() {
                body.setTitle(title);
                body.$(parent).children().replaceWith(newView.$el);
                Pump.followStreams();
                if (callback) {
                    callback();
                }
            });

            newView.render();
        }
    });

    Pump.modals = {};

    Pump.showModal = function(Cls, options, callback) {

        var modalView,
            templateName = Cls.prototype.templateName;

        if (!callback) {
            callback = options;
            options = {};
        }

        // If we've got it attached already, just show it
        if (_.has(Pump.modals, templateName)) {
            modalView = Pump.modals[templateName];
            modalView.$el.modal('show');
        } else {
            // Otherwise, create a view
            modalView = new Cls(options);
            Pump.modals[templateName] = modalView;
            // When it's ready, show immediately
            modalView.on("ready", function() {
                $("body").append(modalView.el);
                modalView.$el.modal('show');
            });
            // render it (will fire "ready")
            modalView.render();
        }
    };

    Pump.resetWysihtml5 = function(el) {
        var fancy = el.data('wysihtml5');
        if (fancy && fancy.editor && fancy.editor.clear) {
            fancy.editor.clear();
        }
        $(".wysihtml5-command-active", fancy.toolbar).removeClass("wysihtml5-command-active");
        return el;
    };

    Pump.addMajorActivity = function(act) {
        if (Pump.body.content) {
            Pump.body.content.addMajorActivity(act);
        }
    };

    Pump.addMinorActivity = function(act) {
        if (Pump.body.content) {
            Pump.body.content.addMinorActivity(act);
        }
    };

})(window._, window.$, window.Backbone, window.Pump);
