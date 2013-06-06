var Fiber = Npm.require('fibers')

var exportMe = (function() {
	var AWS = Npm.require('aws-sdk');

	return {
		AWS: AWS,
		s3: new AWS.S3(),
		setCredentials: function(keyId, secret) {
			this.AWS.config.update({accessKeyId: keyId, secretAccessKey: secret})
			this.s3 = new AWS.S3()
		},
		listBucket: function(bucket, prefix, callback) {
			var items = [];
			var s3 = this.s3;
			
			var fetchSome = function(marker) {
				var params = {
					Bucket: bucket,
					Prefix: prefix
				};
				
				if(marker) {
					params.Marker = marker;
				}
				
				s3.listObjects(params, function(err, data) {
					if(err) {
						Fiber(function() {
							callback(err, data)
						}).run()
						return;
					}
					
					items.push.apply(items, data.Contents)
					
					if(data.IsTruncated) {
						// go and fetch some more...
						fetchSome(data.Contents[data.Contents.length-1].Key);
						return;
					}
					else {
						Fiber(function() {
							callback(err, items);
						}).run();
					}
				})				
			}
			
			fetchSome(null);
		},
		getObject: function(params, callback) {
			var s3 = this.s3;
			
			s3.getObject(params, function(err, data) {
				if(callback)
					Fiber(function() {
						callback(err, data)
					}).run();
			});
		},
		putObject: function(params, callback) {
			var s3 = this.s3;
			
			s3.putObject(params, function(err, data) {
				if(callback)
					Fiber(function() {
						callback(err, data)
					}).run();
			});
		}
	}
})();

AWS = exportMe;