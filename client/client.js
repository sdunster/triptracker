
var CheckinSubscription = Meteor.subscribe("checkins")
var PhotoSubscription = Meteor.subscribe("photos")

var Map;
var Markers = {};
var SelectedVenue;

jQuery.fn.visible = function() {
	var elem = $(this[0])
	
    var docViewTop = $(window).scrollTop();
    var docViewBottom = docViewTop + $(window).height();

    var elemTop = $(elem).offset().top;
    var elemBottom = elemTop + $(elem).height();

    return ((elemBottom <= docViewBottom) && (elemTop >= docViewTop));
}

var makeMarker = function(color) {
	return new google.maps.MarkerImage("http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|" + color,
        new google.maps.Size(21, 34),
        new google.maps.Point(0,0),
        new google.maps.Point(10, 34));
}

var makeMarkerShadow = function() {
    return new google.maps.MarkerImage("http://chart.apis.google.com/chart?chst=d_map_pin_shadow",
	    new google.maps.Size(40, 37),
	    new google.maps.Point(0, 0),
	    new google.maps.Point(12, 35));
}

var updateSelection = function() {
	var closestItem = null;
	var smallestDistance = 0;
	var center = $(window).scrollTop() + ($(window).height() / 2);
	
	// find the item that is closest to the centre of the screen
	$('ul.sidebar > li').each(function() {
		var elemCenter = $(this).offset().top + ($(this).height()/2);
		var distanceFromCenter = Math.abs(center - elemCenter);
		
		if(closestItem == null || smallestDistance > distanceFromCenter) {
			closestItem = this;
			smallestDistance = distanceFromCenter;
		}
	});
	
	// highlight
	$('ul.sidebar > li.selected').toggleClass('selected', false);
	$(closestItem).toggleClass('selected', true);
	
	// find associated checkin in DB
	var id = $(closestItem).data('id')
	var checkin = Checkins.findOne({id: id});
	
	if(checkin && checkin.venue && checkin.venue.location &&
			checkin.venue.location.lat && checkin.venue.location.lng) {
	    var scale = Math.pow(2,Map.getZoom());
		var offsetx = -($('ul.sidebar').width() / 2) / scale;

		// centre map and highlight marker
		var whenMapIsReady = function() {
			var projection = Map.getProjection();
			var pxlocation = projection.fromLatLngToPoint(new google.maps.LatLng(checkin.venue.location.lat, checkin.venue.location.lng))
			Map.panTo(projection.fromPointToLatLng(new google.maps.Point(pxlocation.x + offsetx, pxlocation.y)));
			if(SelectedVenue != checkin.venue.id) {
				if(Markers[SelectedVenue]) {
					Markers[SelectedVenue].setIcon(Map.secondaryMarker)
				}
				SelectedVenue = checkin.venue.id;
				if(Markers[SelectedVenue]) {
					Markers[SelectedVenue].setIcon(Map.primaryMarker)
				}
			}
		}

		// if getProjection() is null then the map probably isn't ready yet			
		if(Map.getProjection()) {
			whenMapIsReady();
		}
		else {
			google.maps.event.addListenerOnce(Map, 'idle', whenMapIsReady);
		}
	}
}

var updateMarkers = function() {
	var checkins = Checkins.find({}, {sort: [["createdAt", "desc"]]})
	var venueIds = [];

	// create markers for each checkin, but only one for each venue
	checkins.forEach(function (checkin) {		
		if(checkin && checkin.venue && checkin.venue.location &&
				checkin.venue.location.lat && checkin.venue.location.lng) {
			
			// add this to our list of current venue IDs (venues not in this array will have their markers purged)
			if(!_.contains(venueIds, checkin.venue.id))
				venueIds.push(checkin.venue.id);
			
			// if marker doesn't already exist...
			if(!Markers[checkin.venue.id]) {    			
				Markers[checkin.venue.id] = new google.maps.Marker({
					position: new google.maps.LatLng(checkin.venue.location.lat, checkin.venue.location.lng),
					title: checkin.venue.name,
					icon: Map.secondaryMarker
				});
				Markers[checkin.venue.id].setMap(Map);
			}
		}
	})
	
	// check to see if any markers need to be deleted
	for(var id in Markers) {
		if(!_.contains(venueIds, id)) {
			console.log("Marker deleted: "+Markers[id].getTitle())
			Markers[id].setMap(null);
			delete Markers[id];
		}
	}
}

Meteor.startup(function () {
	var opts = {
		center: new google.maps.LatLng(48, -10),
		zoom: 15,
		disableDefaultUI: true,
		draggable: false,
		scrollwheel: false,
		disableDoubleClickZoom: true,
		//mapTypeId: google.maps.MapTypeId.TERRAIN,
		mapTypeId: google.maps.MapTypeId.ROADMAP,
		zoomControl: true,
		zoomControlOptions: {
			style: google.maps.ZoomControlStyle.SMALL,
			position: google.maps.ControlPosition.RIGHT_CENTER
		}
	}

	google.maps.visualRefresh = true;
	Map = new google.maps.Map($("#map").get(0), opts);
	
	Map.primaryMarker = makeMarker('FE7569');
	Map.secondaryMarker = makeMarker('666666');
	
	// recenter map after zoom in/out
	google.maps.event.addListener(Map, 'zoom_changed', updateSelection);

	Meteor.autorun(function () {
		Checkins.find({});

		// this should rerun whenever checkins changes
		// TODO: find better way to do this
		updateSelection();
	})

	// update markers whenever checkins changes
	Meteor.autorun(function () {
		updateMarkers();
	})
})

$(window).scroll(updateSelection);
$(window).resize(updateSelection);

Template.entries.entries = function () {
	// would be nice to do this without storing the entire contents of the DB in memory...
	var checkins = Checkins.find({}, {sort: [["createdAt", "desc"]]}).fetch();
	var photos = Photos.find({}, {sort: [["createdAt", "desc"]]}).fetch();
	var entries = [];
	
	for(var i = 0, j = 0; i < checkins.length || j < photos.length; ) {
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

Template.root.loading = function() {
	return !CheckinSubscription.ready() || !PhotoSubscription.ready();
}

Template.entries.checkin = function () {
	return this.type == "checkin";
}

Template.entries.photo = function() {
	return this.type == "photo";
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

Template.checkin.photo = function () {
	var photo = this.photos.items[0];
	return photo.prefix + "width380" + photo.suffix
}

Template.checkin.address = function () {
	return this.venue.address
}

Template.photo.id = function() {
	return this._id;
}

Template.photo.photo = function() {
	return "http://europe-photos.sdunster.com/"+this.key;
}
