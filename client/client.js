
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
		var checkin = Checkins.findOne({}, {sort: [["createdAt", "desc"]]});

		// if the last checkin has coords then centre map on it
		if(checkin && checkin.venue && checkin.venue.location &&
				checkin.venue.location.lat && checkin.venue.location.lng)
			map.panTo(new google.maps.LatLng(checkin.venue.location.lat, checkin.venue.location.lng - 10))
	})

	Meteor.autorun(function () {
		var markers = []
		var checkins = Checkins.find({}, {sort: [["createdAt", "desc"]]})

		// clear existing markers
		for(var i in markers) {
			markers[i].setMap(null);
		}

		// create markers for each checkin
		checkins.forEach(function (checkin) {
			if(checkin && checkin.venue && checkin.venue.location &&
					checkin.venue.location.lat && checkin.venue.location.lng) {
				var marker = new google.maps.Marker({
					position: new google.maps.LatLng(checkin.venue.location.lat, checkin.venue.location.lng),
					title: checkin.venue.name
				});
				marker.setMap(map);
				markers.push(marker);
			}
		})
	})
})

jQuery.fn.visible = function() {
	var elem = $(this[0])
	
    var docViewTop = $(window).scrollTop();
    var docViewBottom = docViewTop + $(window).height();

    var elemTop = $(elem).offset().top;
    var elemBottom = elemTop + $(elem).height();

    return ((elemBottom <= docViewBottom) && (elemTop >= docViewTop));
}

jQuery.fn.centred = function() {
	var elem = $(this[0])
	
    var centre = $(window).scrollTop() + ($(window).height() / 2);

    var elemTop = $(elem).offset().top;
    var elemBottom = elemTop + $(elem).height();

    return ((elemBottom >= centre) && (elemTop <= centre));
}

$(window).scroll(function() {
	$('ul.sidebar > li').each(function() {
		$(this).toggleClass('selected',$(this).centred())
	})
});

Template.checkins.checkins = function () {
	return Checkins.find({}, {sort: [["createdAt", "desc"]]})
}

Template.checkins.count = function () {
	return Checkins.find({}).count()
}

Template.checkin.selected = function() {
	// stub
	return false;
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
