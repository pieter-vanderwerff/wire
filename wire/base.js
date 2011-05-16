/**
 * @license Copyright (c) 2011 Brian Cavalier
 * LICENSE: see the LICENSE.txt file. If file is missing, this file is subject
 * to the MIT License at: http://www.opensource.org/licenses/mit-license.php.
 */

/*
	File: base.js
	Base wire plugin that provides properties, init, and destroy facets, and a
	proxy for plain JS objects.
*/
define([], function() {
	var tos, undef;

	tos = Object.prototype.toString;

	function isArray(it) {
		return tos.call(it) == '[object Array]';
	}

	function invoke(promise, func, target, args, wire) {
		var f = target[func];
		if(typeof f == 'function') {
			if(args) {
				wire(args).then(function(resolvedArgs) {
					try {
						var result = f.apply(target, (tos.call(resolvedArgs) == '[object Array]')
							? resolvedArgs
							: [resolvedArgs]);
							
						promise.resolve(result);

					} catch(e) {
						promise.reject(e);

					}
				});
			}			
		}
	}

	function invokeAll(promise, facet, wire) {
		var target, options;

		target  = facet.target;
		options = facet.options;

		if(typeof options == 'string') {
			invoke(promise, options, target, [], wire);

		} else {
			var promises, p, func;
			promises = [];

			for(func in options) {
				p = wire.deferred();
				promises.push(p);
				invoke(p, func, target, options[func], wire);
			}
			
			wire.whenAll(promises).then(function() {
				promise.resolve();
			});
		}
	}

	function literalFactory(promise, spec, wire) {
		promise.resolve(spec.wire$literal);
	}

	function propertiesFacet(promise, facet, wire) {
		var options, promises, p, prop;

		promises = [];
		options = facet.options;

		for(prop in options) {
			promises.push(setProperty(facet, prop, options[prop], wire));
		}

		wire.whenAll(promises).then(
			function() {
				promise.resolve();
			},
			function(err) {
				promise.reject(err);
			}
		);
	}

	function setProperty(proxy, name, val, wire) {
		var promise = wire(val);

		promise.then(function(resolvedValue) {
			proxy.set(name, resolvedValue);
		});

		return promise;
	}


	function initFacet(promise, facet, wire) {
		invokeAll(promise, facet, wire);
	}

	function pojoProxy(object, spec) {
		return {
			get: function(property) {
				return object[property];
			},
			set: function(property, value) {
				object[property] = value;
				return value;
			},
			invoke: function(method, args) {
				return method.apply(object, args);
			}
		};
	}

	return {
		wire$plugin: function(ready, destroyed, options) {
			var destroyFuncs = [];

			destroyed.then(function() {
				var destroy;

				while((destroy = destroyFuncs.shift())) {
					destroy();
				}
			});

			function destroyFacet(promise, facet, wire) {
				promise.resolve();
				
				var target, options, w;
				
				target = facet.target;
				options = facet.options;
				w = wire;

				destroyFuncs.push(function destroyObject() {
					invokeAll(wire.deferred(), { options: options, target: target }, w);
				});
			}
			
			return {
				factories: {
					wire$literal: literalFactory
				},
				facets: {
					// properties facet.  Sets properties on components
					// after creation.
					properties: {
						configure: propertiesFacet
					},
					// init facet.  Invokes methods on components after
					// they have been configured
					init: {
						initialize: initFacet
					},
					// destroy facet.  Registers methods to be invoked
					// on components when the enclosing context is destroyed
					destroy: {
						ready: destroyFacet
					}
				},
				proxies: [
					pojoProxy
				]
			};				
		}
	};
});