var Fiber = Npm.require('fibers')
var connect = Npm.require('connect')

var foursquare = Foursquare({
	'secrets' : {
		'clientId' : Config.foursquare.clientId,
		'clientSecret' : Config.foursquare.clientSecret,
		'redirectUrl' : Config.foursquare.redirectUrl
	}
})

var code = Config.foursquare.code;
var accessToken = Config.foursquare.accessToken;
var processingPhotos = false;

/*
foursquare.getAccessToken({
	code: code
  }, function (error, accessToken) {
	if(error) {
	  console.log('An error was thrown: ' + error.message);
	  console.log(error)
	  throw error
	}
	else {
	  console.log('Access token: ' + accessToken)
	}
  });
*/

Meteor.publish("checkins", function() {
	// send all checkins
	return Checkins.find({})
})

Meteor.publish("photos", function() {
	// only send photos that have been processed and have a creation time (from EXIF)
	return Photos.find({processed: true, createdAt: {$exists: true}})
})

var app = __meteor_bootstrap__.app;
var router = connect.middleware.router(function(route) {
	route.get('/login', function(req, res) {
		res.writeHead(303, {'Location': foursquare.getAuthClientRedirectUrl() })
		res.end()
	})
	
	route.post('/4sqpush', function(req, res) {
		syncCheckins()
		res.end('OK')
	})
})
app.use(router)

function upsertCheckin(checkin) {
// return true if insert, else update
	var id = checkin.id;
	var doc;
	
	if(typeof (doc = Checkins.findOne({id: id})) == 'undefined') {
		doc = Checkins.insert(checkin)
		return true
	}
	else {
		Checkins.update(doc._id, checkin)
		return false
	}
}

function syncCheckins() {
	foursquare.Users.getCheckins('self', {limit: 250, afterTimestamp: 1362549600},	accessToken, function(error, results) {
		Fiber(function() {
			var updated = 0
			var inserted = 0
			
			if(!results) {
				console.log('4sq sync failed')
				return;
			}
						
			for(var i in results.checkins.items) {
				if(upsertCheckin(results.checkins.items[i]))
					inserted++;
				else
					updated++;
			}
			
			console.log("4sq sync - inserted "+inserted+", updated "+updated+".")
		}).run()
	});
}

function syncPhotos(done) {
	AWS.listBucket('sdunster-europe', function(err, objects) {
		var existingKeys = [];
		
		if(err) {
			console.log("S3 error: "+err)
			return;
		}
	
		for(var i in objects) {
			var obj = objects[i]
			var doc;
			
			var extensionRegex = /(\.|\/)(gif|jpe?g|png)$/i
			
			if(!extensionRegex.test(obj.Key)) {
				continue;
			}
						
			existingKeys.push(obj.Key)
			
			var data = {
				key: obj.Key,
				etag: obj.ETag,
				modified: obj.LastModified,
				size: obj.Size,
				processed: false,
				processStartTime: 0
			};
			
			if(typeof (doc = Photos.findOne({key: obj.Key})) == 'undefined') {
				// insert fresh, unprocessed record
				doc = Photos.insert(data);
			}
			else {
				if(doc.etag != data.etag ||
						doc.modified.getTime() != data.modified.getTime() ||
						doc.size != data.size) {
					// mark existing record as unprocessed because it needs to be re-processed
					Photos.update(doc._id, data);
					console.log("Scheduling "+doc.key+" for re-process because it's attributes changed")
				}
			}
		}
		
		// remove items that aren't in existingKeys
		Photos.find({}).forEach(function(photo) {
			if(!_.contains(existingKeys, photo.key)) {
				Photos.remove(photo._id);
			}
		})
		
		if(done)
			done(null);
	})
}

var maxConcurrentDownloads = 3;
var currentDownloads = 0;

function processPhotos() {
	var earlier = (new Date()).getTime() - 60*1;
	var photo = Photos.findOne({processed: false, processStartTime: {$lt: earlier}});
	
	if(photo != null && currentDownloads < maxConcurrentDownloads) {
		currentDownloads++;
		Photos.update(photo._id, {$set: {processStartTime: (new Date()).getDate()}})
		AWS.getObject({Bucket: 'sdunster-europe', Key: photo.key}, function(err, data) {
			currentDownloads--;
			Meteor.setTimeout(processPhotos, 0);
			
			if(err) {
				console.log('S3 getObject error: '+err)
				return;
			}
			
			try {
				new ExifImage({image: data.Body}, function (error, image) {
					if (error) {
						console.log('EXIF Error: '+error.message);
						return;
					}
					else {
						//console.log(image); // Do something with your data!
						//console.log(image.gps);
						
						var keys = {
							key: photo.key,
							etag: photo.etag,
							modified: photo.modified,
							size: photo.size,
							processed: true
						}
						
						if(image.gps && image.gps.GPSLatitude && image.gps.GPSLongitude) {
							var lat = image.gps.GPSLatitude;
							var lng = image.gps.GPSLongitude;
							
							if(lat.components == 3) {
								keys.lat = (lat.value[0] + 
									(lat.value[1] / 60) + 
									(lat.value[2] / 60 / 60)) * 
									(image.gps.GPSLatitudeRef.value == 'N' ? 1 : -1)
							}
							
							if(lat.components == 2) {
								keys.lat = (lat.value[0] + 
								(lat.value[1] / 60)) * 
								(image.gps.GPSLatitudeRef.value == 'N' ? 1 : -1)
							}
							
							if(lng.components == 3) {
								keys.lng = (lng.value[0] + 
								(lng.value[1] / 60) + 
								(lng.value[2] / 60 / 60)) *
								(image.gps.GPSLongitudeRef.value == 'E' ? 1 : -1)
							}
							
							if(lng.components == 2) {
								keys.lng = (lng.value[0] +
								(lng.value[1] / 60)) *
								(image.gps.GPSLongitudeRef.value == 'E' ? 1 : -1)
							}
							
							console.log("Coords: "+keys.lat+","+keys.lng)
						}
						
						if(image.exif && image.exif.DateTimeOriginal) {
							var bits;
							bits = image.exif.DateTimeOriginal.value.split(" ")
							
							var date = bits[0].split(":")
							var time = bits[1].split(":")
							
							keys.createdAt = new Date(date[0], date[1], date[2], time[0], time[1], time[2], 0);
														
							console.log("Time: "+keys.createdAt)
						}
						
						Photos.update(photo._id, keys);
						
						return;
					}
				});
			} catch (error) {
				console.log('EXIF Error: '+error);
			}
		})
		
		Meteor.setTimeout(processPhotos, 0);
		return;
	}
	
	// no photos to process, wait 1 minute before trying again, only if this is the last thread
	if(currentDownloads == 0)
		Meteor.setTimeout(processPhotos, 1000 * 60);
	
	if(photo == null) {
		console.log("No photos to process")
	}
}

Meteor.startup(function () {
	syncCheckins()
	syncPhotos(function(error) {
		processPhotos();
	}) // wait until photo sync is done before starting photo process
	
	// resync every 15 mins
	Meteor.setInterval(syncCheckins, 1000 * 60 * 15);
});

