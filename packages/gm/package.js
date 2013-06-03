Package.describe({
	summary: "GraphicsMagick for Meteor"
})

Package.on_use(function(api) {
	api.add_files('gm_server.js', 'server');
});

Npm.depends({'gm': '1.9.1'});
