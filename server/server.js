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
	return Checkins.find({})
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
	var id = checkin.id
	var doc
	
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

Meteor.startup(function () {
	syncCheckins()
	AWS.listBucket('sdunster-europe', function(objects) {
		console.log(objects);
	})
	
	// resync every 15 mins
	Meteor.setInterval(syncCheckins, 1000 * 60 * 15);
});

