/*

function () {
	Meteor.startup(function () {
		document.body.appendChild(Spark.render(Meteor._def_template(null, Handlebars.json_ast_to_func(['<div class="map-container">\n  <div id="map"></div>\n  </div>\n	 \n	 <ul class="sidebar">\n	   \n	 <li>\n		 <header>\n		<h1>Sam and Rach In Europe</h1>\n	   </header>\n		<article>\n		<div><a href="https://www.icloud.com/photostream/#A2532ODWxY9J5">Photo Stream</a></div>\n			<div><a href="http://twitter.com/sdunster">Twitter</a></div>\n		   <div><a href="http://foursquare.com/sdunster">Foursquare</a></div>\n		 </article>\n	 </li>\n	\n	', [">", "checkins"], "\n	\n  </ul>"]))))
	}), Meteor._def_template("checkins", Handlebars.json_ast_to_func([
		["#", [
				[0, "each"],
				[0, "checkins"]
			],
			["\n	", [">", "checkin"], "\n  "]
		]
	])), Meteor._def_template("checkin", Handlebars.json_ast_to_func(['<li>\n  	  <header>\n  		   <img src="', ["{", [
				[0, "categoryImg"]
			]], '" class="icon" />\n  		   <div class="right">', ["{", [
				[0, "category"]
			]], "</div>\n		  <h2>", ["{", [
				[0, "venue"]
			]], '</h2>\n  		   <div class="right">', ["{", [
				[0, "time"]
			]], "</div>\n  		<div>", ["{", [
				[0, "location"]
			]], "</div>\n  	  </header>\n  	  ", ["#", [
				[0, "if"],
				[0, "hasInfo"]
			],
			["\n  		 <article>\n		 ", ["{", [
						[0, "comment"]
					]], "\n		", ["#", [
						[0, "if"],
						[0, "hasPhoto"]
					],
					['\n		   <img src="', ["{", [
								[0, "photo"]
							]], '" />\n		']
				], "\n		  </article>\n	 		"]
		], "\n	</li>"]))


*/

Meteor.subscribe("checkins")

Meteor.startup(function () {
	var opts = {
		center: new google.maps.LatLng(48, -10),
		zoom: 4,
		disableDefaultUI: true,
		draggable: false,
		scrollwheel: false,
		disableDoubleClickZoom: true,
		mapTypeId: google.maps.MapTypeId.TERRAIN,
		zoomControl: true,
		zoomControlOptions: {
			style: google.maps.ZoomControlStyle.SMALL,
			position: google.maps.ControlPosition.TOP_RIGHT
		}
	}
	
	var map = new google.maps.Map($("#map").get(0), opts);
	
	Meteor.autorun(function () {
		var checkin = Checkins.findOne({}, {
			sort: [
				["createdAt", "desc"]
			]
		});
		
		if(checkin && checkin.venue && checkin.venue.location &&
				checkin.venue.location.lat && checkin.venue.location.lng)
			map.panTo(new google.maps.LatLng(e.venue.location.lat, e.venue.location.lng - 10))
	})
	
	Meteor.autorun(function () {
		for (var checkins = [], n = Checkins.find({}, {sort: [["createdAt", "desc"]]}), r = 0; checkins.length > r; r++) checkins[r].setMap(null);
		checkins = [], n.forEach(function (n) {
			if (n && n.venue && n.venue.location && n.venue.location.lat && n.venue.location.lng) {
				var r = new google.maps.Marker({
					position: new google.maps.LatLng(n.venue.location.lat, n.venue.location.lng),
					title: n.venue.name
				});
				r.setMap(map), e.push(r)
			}
		})
	})
})

Template.checkins.checkins = function () {
	return Checkins.find({}, {
		sort: [
			["createdAt", "desc"]
		]
	})
}

Template.checkins.count = function () {
	return Checkins.find({}).count()
}

Template.checkin.venue = function () {
	return this.venue.name
}

Template.checkin.time = function () {
	var date = new Date(1e3 * this.createdAt);
	return date.toLocaleDateString() + " - " + date.getHours() + ":" + date.getMinutes()
}

Template.checkin.location = function () {
	return this.venue.location.city ?
		this.venue.location.city + ", " + this.venue.location.country :
		this.venue.location.country
}

Template.checkin.hasInfo = function () {
	return this.shout || this.photos.count > 0
}

Template.checkin.comment = function () {
	return this.shout ? this.shout : void 0
}

Template.checkin.category = function () {
	for (var i in this.venue.categories) {
		var category = this.venue.categories[i];
		if (category.primary) return this.venue.categories[i].name
	}
}

Template.checkin.categoryImg = function () {
	for (var i in this.venue.categories) {
		var category = this.venue.categories[e];
		if (category.primary) return category.icon.prefix + "bg_32" + category.icon.suffix
	}
}

Template.checkin.hasPhoto = function () {
	return this.photos.count > 0
}

Template.checkin.photo = function () {
	var photo = this.photos.items[0];
	return photo.prefix + "width380" + photo.suffix
}

Template.checkin.address = function () {
	return this.venue.address
}
