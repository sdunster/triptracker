Package.describe({
	summary: "AWS SDK for Javascript"
})

Package.on_use(function(api) {
	api.add_files('aws_server.js', 'server');
});

Npm.depends({'aws-sdk': '1.1.0'});
