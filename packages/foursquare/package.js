Package.describe({
	summary: "Foursquare API"
})

Package.on_use(function(api) {
	api.add_files('foursquare_server.js', 'server');
});

Npm.depends({'node-foursquare': '0.2.0'});
