var CheckinSubscription = Meteor.subscribe("checkins")
var PhotoSubscription = Meteor.subscribe("photos")

Map = {
	map: null,
	checkinMarkers: {},
	photoMarkers: {},
	selectedMarker: null,
	makeMarker: function(color) {
		return new google.maps.MarkerImage(
			"http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|" + color,
			new google.maps.Size(21, 34),
			new google.maps.Point(0,0),
			new google.maps.Point(10, 34));
	},
	makeMarkerShadow: function() {
		return new google.maps.MarkerImage(
			"http://chart.apis.google.com/chart?chst=d_map_pin_shadow",
			new google.maps.Size(40, 37),
			new google.maps.Point(0, 0),
			new google.maps.Point(12, 35));
	},
	onZoom: function(handler) {
		if(this.map)
			google.maps.event.addListener(this.map, 'zoom_changed', handler);	
	},
	init: function() {		
		var script = document.createElement('script')
		script.type = 'text/javascript';
		script.src = 'http://maps.googleapis.com/maps/api/js?key=AIzaSyCecLqoAWxbOQgLwbLpvOGK9Ei4hnwDUZI&sensor=false&callback=Map.googleReady';
		document.body.appendChild(script);
	},
	googleReady: function() {
		var self = this;

		var opts = {
			center: new google.maps.LatLng(48, -10),
			zoom: 15,
			disableDefaultUI: true,
			draggable: false,
			scrollwheel: false,
			disableDoubleClickZoom: true,
			mapTypeId: google.maps.MapTypeId.ROADMAP,
			zoomControl: true,
			zoomControlOptions: {
				style: google.maps.ZoomControlStyle.SMALL,
				position: google.maps.ControlPosition.RIGHT_CENTER
			}
		}
		
		google.maps.visualRefresh = true;
		this.map = new google.maps.Map($("#map").get(0), opts);
		
		this.icon = {
			selected: this.makeMarker('FE7569'),
			checkin: this.makeMarker('666666'),
			photo: this.makeMarker('669999'),
			shadow: this.makeMarkerShadow()
		}
		
		// update markers whenever checkins changes
		Meteor.autorun(function () {
			self.updateMarkers();
		})
	},
	center: function(lat, lng, cb) {
		if(!this.map)
			return;
		
	    var scale = Math.pow(2,this.map.getZoom());
		var offsetx = -($('ul.sidebar').width() / 2) / scale;
		var self = this;

		// center map and highlight marker
		var whenMapIsReady = function() {
			var projection = self.map.getProjection();
			var pxlocation = projection.fromLatLngToPoint(new google.maps.LatLng(lat, lng))
			self.map.panTo(projection.fromPointToLatLng(new google.maps.Point(
				pxlocation.x + offsetx,
				pxlocation.y
			)));
			
			if(cb) cb();
		}

		// if getProjection() is null then the map probably isn't ready yet			
		if(this.map.getProjection()) {
			whenMapIsReady();
		}
		else {
			google.maps.event.addListenerOnce(this.map, 'idle', whenMapIsReady);
		}
	},
	selectMarker: function(marker) {
		if(this.selectedMarker != marker) {
			if(this.selectedMarker) {
				this.selectedMarker.setIcon(this.selectedMarker.oldIcon);
				delete this.selectedMarker.oldIcon;
			}
			this.selectedMarker = marker;
			if(this.selectedMarker) {
				this.selectedMarker.oldIcon = this.selectedMarker.getIcon();
				this.selectedMarker.setIcon(this.icon.selected);
			}
		}
	},
	addMarker: function(lat, lng, icon, title) {
		var marker = new google.maps.Marker({
			position: new google.maps.LatLng(lat, lng),
			title: title,
			icon: Map.map.secondaryMarker
		});
		
		if(icon)
			marker.setIcon(icon)
		
		if(title)
			marker.setTitle(title)
		
		marker.setMap(this.map);
		
		return marker;
	},
	updateMarkers: function() {
		if(!this.map)
			return;
		
		var checkins = Checkins.find({}, {sort: [["createdAt", "desc"]]})
		var photos = Photos.find({}, {sort:[["createdAt","desc"]]})
		var venueIds = [];
		var photoKeys = [];
		var self = this;
	
		// create markers for each checkin, but only one for each venue
		checkins.forEach(function (checkin) {		
			if(checkin.venue && checkin.venue.location &&
					checkin.venue.location.lat && checkin.venue.location.lng) {
				if(!_.contains(venueIds, checkin.venue.id))
					venueIds.push(checkin.venue.id);
				
				// if marker doesn't already exist...
				if(!self.checkinMarkers[checkin.venue.id]) {   
					self.checkinMarkers[checkin.venue.id] = self.addMarker(
						checkin.venue.location.lat,
						checkin.venue.location.lng,
						self.icon.checkin,
						checkin.venue.name);		
				}
			}
		})
		
		// create markers for each photo
		photos.forEach(function(photo) {
			if(photo.lat && photo.lng) {
				if(!_.contains(photoKeys, photo.key))
					photoKeys.push(photo.key)
				
				if(!self.photoMarkers[photo.key]) {
					self.photoMarkers[photo.key] = self.addMarker(
						photo.lat,
						photo.lng,
						self.icon.photo
					)
				}
			}
		})
		
		// check to see if any markers need to be deleted
		for(var id in this.checkinMarkers) {
			if(!_.contains(venueIds, id)) {
				this.checkinMarkers[id].setMap.map(null);
				delete this.checkinMarkers[id];
			}
		}
		
		for(var key in this.photoMarkers) {
			if(!_.contains(photoKeys, key)) {
				this.photoMarkers[key].setMap.map(null);
				delete this.photoMarkers[key];
			}
		}
	}
}

jQuery.fn.visible = function() {
	var elem = $(this[0])
	
    var docViewTop = $(window).scrollTop();
    var docViewBottom = docViewTop + $(window).height();

    var elemTop = $(elem).offset().top;
    var elemBottom = elemTop + $(elem).height();

    return ((elemBottom <= docViewBottom) && (elemTop >= docViewTop));
}

var CenteredItem = null;

var updateSelection = function() {
	var closestItem = null;
	var smallestDistance = 0;
	var center = $(window).scrollTop() + ($(window).height() / 2);
	
	// find the item that is closest to the center of the screen
	$('ul.sidebar > li').each(function() {
		var elemCenter = $(this).offset().top + ($(this).height()/2);
		var distanceFromCenter = Math.abs(center - elemCenter);
		
		if(closestItem == null || smallestDistance > distanceFromCenter) {
			closestItem = this;
			smallestDistance = distanceFromCenter;
		}
	});
	
	if(CenteredItem != closestItem) {
		CenteredItem = closestItem;
		
		// highlight
		$('ul.sidebar > li.selected').toggleClass('selected', false);
		$(closestItem).toggleClass('selected', true);
		
		recenter();
	}
}

var recenter = function() {
	var item = CenteredItem;

	// find the checkin in the DB, center map on it's location and highlight it's marker
	if($(item).hasClass('checkin')) {
		var id = $(item).data('id')
		var checkin = Checkins.findOne({id: id});
			
		if(checkin && checkin.venue && checkin.venue.location &&
				checkin.venue.location.lat && checkin.venue.location.lng) {
			Map.center(checkin.venue.location.lat, checkin.venue.location.lng);
			Map.selectMarker(Map.checkinMarkers[checkin.venue.id]);
		}
	}
	
	// find the photo in the DB, center map on it's location and highlight it's marker
	if($(item).hasClass('photo')) {
		var key = $(item).data('key')
		var photo = Photos.findOne({key: key});
		
		if(photo && photo.lat && photo.lng) {
			Map.center(photo.lat, photo.lng);
			Map.selectMarker(Map.photoMarkers[photo.key]);
		}
	}
}

var numPhotos = 0;
var numCheckins = 0;

Meteor.startup(function () {
	// to start with only show 20 items
	Session.set('limit', 20);
	
	Map.init();
	Map.onZoom(recenter);

	$(window).scroll(updateSelection);
	$(window).scroll(function() {
		var scroll = $(window).scrollTop();
		var length = $(document).height();
		var pageHeight = $(window).height();
		
		if(scroll >= length - (pageHeight * 5)) {
			var limit = Session.get('limit');
			
			if(limit >= numPhotos + numCheckins) {
				return;
			}
			
			Session.set('limit', limit + 20);
		}
	});
	$(window).resize(updateSelection);
	
	Meteor.autorun(function() {
		numPhotos = Photos.find({}).count();
	})
	
	Meteor.autorun(function() {
		numCheckins = Checkins.find({}).count();
	})
	
	Meteor.autorun(function() {
		if(CheckinSubscription.ready() && PhotoSubscription.ready()) {
			$('#loading_overlay').fadeOut()
			updateSelection();
		}
	});
})


/*********************************
 * Templates
 *********************************/

Template.entries.entries = function () {
	var limit = Session.get('limit');
	
	// would be nice to do this without storing the entire contents of the DB in memory...
	var checkins = Checkins.find({}, {sort: [["createdAt", "desc"]]}).fetch();
	var photos = Photos.find({}, {sort: [["createdAt", "desc"]]}).fetch();
	var entries = [];
	
	for(var i = 0, j = 0; (i < checkins.length || j < photos.length) && entries.length < limit; ) {
		if(i >= checkins.length) {
			doPhoto();
			continue;
		}
		
		if(j >= photos.length) {
			doCheckin();
			continue;
		}
		
		if(checkins[i].createdAt > photos[j].createdAt.getTime()/1000) {
			doCheckin();
		}
		else {
			doPhoto();
		}
		
		function doCheckin() {
			var checkin = checkins[i++];
			checkin.type = "checkin";
			entries[entries.length] = checkin;
		}
		
		function doPhoto() {
			var photo = photos[j++];
			photo.type = "photo";
			entries[entries.length] = photo;
		}
	}

	return entries;
}

Template.root.finishedLoading = function() {
	return CheckinSubscription.ready() && PhotoSubscription.ready();
}

// whenever the entries list is updated we need to recheck the current selection
Template.entries.rendered = function() {
	updateSelection();
}

Template.entries.checkin = function () {
	return this.type == "checkin";
}

Template.entries.photo = function() {
	return this.type == "photo";
}

Template.checkin.rendered = function() {
	$(this).find('a.img').fancybox({
		closeBtn  : false,
		
		openEffect : 'elastic',
		openSpeed  : 150,

		closeEffect : 'elastic',
		closeSpeed  : 150,
		
		helpers : {
			buttons	: {}
		},
	});
}

Template.checkin.id = function() {
	return this.id;
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
		var category = this.venue.categories[i];
		if (category.primary) return category.icon.prefix + "bg_32" + category.icon.suffix
	}
}

Template.checkin.hasPhoto = function () {
	return this.photos.count > 0
}

Template.checkin.thumb = function () {
	var photo = this.photos.items[0];
	return photo.prefix + "width380" + photo.suffix
}

Template.checkin.photo = function () {
	var photo = this.photos.items[0];
	return photo.prefix + "original" + photo.suffix
}

Template.checkin.address = function () {
	return this.venue.address
}

Template.photo.id = function() {
	return this._id;
}

Template.photo.key = function() {
	return this.key;
}

Template.photo.thumb = function() {
	return "http://europe-cdn.sdunster.com/photos/width356/"+this.key;
}

Template.photo.photo = function() {
	return "http://europe-cdn.sdunster.com/photos/original/"+this.key;
}
