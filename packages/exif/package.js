Package.describe({
	summary: "EXIF"
})

Package.on_use(function(api) {
	api.add_files('exif_server.js', 'server');
});

Npm.depends({'exif': '0.3.0'});
