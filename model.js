
Checkins = new Meteor.Collection("checkins");
Photos = new Meteor.Collection("photos");

Checkins.allow({
	// nothing to see here - only the server can mutate data
})

Photos.allow({
	// nothing to see here - only the server can mutate data
})

