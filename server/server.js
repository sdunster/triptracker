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
if("router" in connect.middleware) {
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
}

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
	AWS.listBucket('sdunster-europe', 'photos/original/', function(err, objects) {
		var existingKeys = [];
		
		if(err) {
			console.log("S3 error: "+err)
			return;
		}
	
		for(var i in objects) {
			var obj = objects[i]
			var doc;
			var prefix = 'photos/original/';
			var key = obj.Key.substring(prefix.length);
			
			var extensionRegex = /(\.|\/)(gif|jpe?g|png)$/i
			
			if(!extensionRegex.test(key)) {
				continue;
			}
			
			existingKeys.push(key)
			
			var data = {
				key: key,
				etag: obj.ETag,
				modified: obj.LastModified,
				size: obj.Size,
				processed: false,
				processStartTime: 0
			};
						
			if(typeof (doc = Photos.findOne({key: key})) == 'undefined') {
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
				console.log("Removing photo from DB because it was removed from S3: "+photo.key)
			}
		})
		
		if(done)
			done(null);
	})
}

var maxImagesBeingProcessed = 5;
var imagesBeingProcessed = 0;

function processPhotos() {
	var earlier = new Date().getTime() - (1000*60*1);
	
	if(imagesBeingProcessed >= maxImagesBeingProcessed) return;
	
	// fetch some photos (based upon how many "processors" we have left
	var remainingProcessors = maxImagesBeingProcessed - imagesBeingProcessed;
	imagesBeingProcessed = maxImagesBeingProcessed;
	var photos = Photos.find({processed: false, processStartTime: {$lt: earlier}}, {limit: remainingProcessors});
	var count = Math.min(photos.count(), remainingProcessors);

	// if we got less photos from DB than we have processors then we
	// can free some
	imagesBeingProcessed -= remainingProcessors - count;

	// start up the "jobs" for each photo, marking each as in-progress
	photos.forEach(function(photo) {
		Photos.update(photo._id, {$set: {processStartTime: (new Date()).getTime()}})
		var key = 'photos/original/'+photo.key;

		AWS.getObject({Bucket: 'sdunster-europe', Key: key}, function(err, data) {
			if(err) {
				console.log('S3 getObject error: '+ err)
				imagesBeingProcessed--;
				Meteor.setTimeout(processPhotos, 0);
				return;
			}
		
			processPhoto(photo, data.Body, function(err) {
				imagesBeingProcessed--;
				Meteor.setTimeout(processPhotos, 0);
			});			
		})
	});
}

function processPhoto(photo, buffer, cb) {
	var error;
	
	// we need to do multiple things, lets do them in parallel, but make sure both
	// are done before we call the callback since the callback can only be
	// called once

    // this will only execute after both jobs are done, passing through one
    // of the errors from the jobs, if there was an error
	var done = _.after(3, function() {
		if(cb) cb(error);
		console.log("Processed photo: "+photo.key)
	})
	
	processPhotoExif(photo, buffer, function(err) {
		if(err) error = err;
		done();
	});
	
	processPhotoThumb(photo, buffer, function(err) {
		if(err) error = err;
		done();
	})
	
	processPhotoDimensions(photo, buffer, function(err) {
		if(err) error = err;
		done();
	})
}

// extract EXIF data from photo
function processPhotoExif(photo, buffer, cb) {
	try {
		new ExifImage({image: buffer}, function (error, image) {
			if (error) {
				console.log('EXIF Error: '+error.message);
				if(cb) cb(error);
				return;
			}
		
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
			}
						
			if(image.exif && image.exif.DateTimeOriginal) {
				var bits;
				bits = image.exif.DateTimeOriginal.value.split(" ")
				
				var date = bits[0].split(":")
				var time = bits[1].split(":")
				
				keys.createdAt = new Date(date[0], date[1]-1, date[2], time[0], time[1], time[2], 0);
			} else {
				console.log("NO EXIF DATE: "+photo.key)
			}
			
			Photos.update(photo._id, keys);
			
			if(cb) cb();
		});
	} catch (error) {
		console.log('EXIF Error: '+error);
		if(cb) cb(error);
		return;
	}
}

function processPhotoDimensions(photo, buffer, cb) {
	try {
		var img = new GM(buffer);
		
		// store the size in the db
		img.size(function(err, value) {
			if(err) {
				console.log('Dimensions error: '+err);
				if(cb) cb(err);
			}
			
			Photos.update(photo._id, {width: value.width, height: value.height});
			if(cb) cb();
		});
		
	} catch(err) {
		console.log('Dimensions error: '+err);
		if(cb) cb(err);
		return;
	}
}

function processPhotoThumb(photo, buffer, cb) {
	try {
		var img = new GM(buffer);
		
		img
		.autoOrient()
		.scale(356)
		.noProfile()
		.quality(75)
		.toBuffer(function(err, buffer) {
			if(err) {
				console.log('Thumbnail error: '+err);
				if(cb) cb(err)
				return;
			}
			
			var params = {
				Bucket: 'sdunster-europe',
				Key: 'photos/width356/'+photo.key,
				Body: buffer
			}
			
			AWS.putObject(params, function(err, data) {
				if(err) {
					console.log('Thumbnail upload failed: '+err);
					if(cb) cb(err);
					return;
				}
				
				if(cb) cb();
			});
			
		});
		
	} catch(err) {
		console.log('Thumbnail error: '+err);
		if(cb) cb(err);
		return;
	}
}

Meteor.startup(function () {
	syncCheckins()
	syncPhotos(function(error) {
		processPhotos();
	}) // wait until photo sync is done before starting photo process
	
	// sync photos DB with S3 every 15 mins
	Meteor.setInterval(function() {
		syncPhotos(function(error) {
			processPhotos();
		}) // wait until photo sync is done before starting photo process
	}, 1000 * 60 * 15);
	
	// resync every 15 mins
	Meteor.setInterval(syncCheckins, 1000 * 60 * 15);
});

