/*
	Description: Allows management of ownership of channels and the like
	Made by MinusGix
*/

/* Notes:
	- Channel names are case sensitive. ?programming is different than ?ProGrammING
		- This is mildly irritating, as it would logically lead to people claiming variations of a popular name.
*/

// TODO: change all mentions of 'room(s)' to 'channel(s)'. Bad habit.
// TODO: think about having so owning a channel means you own all the channels which are different cases, so owning ?test means you also own ?TEsT
// TODO: Possibly have name colors that can be decided. This would make it also have to modify the client, and go beyond a normal server module.

// Doing this here in case I want to change the name, or a person using the module wants to.
const MODULE_NAME = "villa";

// @nick -> nick
function purifyNick (nick) {
	if (nick[0] === '@') {
		return nick.slice(1);
	}
	return nick;
}

const ROLE_NAME_REGEX = /[a-zA-Z_\-\|\(\)\+\=\;\:]/;
function isValidRoleName (roleName) {
	return typeof(roleName) === 'string' && ROLE_NAME_REGEX.test(roleName);
}

// Passes core despite not really needing it, just in case I modify this at a later date.
function isAdmin (core, trip) {
	return trip === 'Admin';
}
// Get if they are a moderator based on their trip
function isMod (core, trip) {
	return trip !== undefined && trip !== null && core.config.mods.includes(trip);
}
function getUserType (core, trip) {
	if (trip === undefined || trip === null) {
		return 'user';
	} else if (isAdmin(core, trip)) {
		return 'admin';
	} else if (isMod(core, trip)) {
		return 'trip';
	} else {
		return 'user';
	}
}

exports.init = (core) => {
	// Note: for now we will store the channel data inside the config
	// but it would be nice to have your own file`

	if (!core.config.hasOwnProperty(MODULE_NAME)) {
		// Indexed by channel names.
		core.config[MODULE_NAME] = {};
	}

	console.log("INITIALIZED VILLA");
};

function findUserInChannel (server, channel, user, type="nick", requiresTrip=false) {
	let sockets = server.findSockets({
		channel: channel,
	});

	for (let i = 0; i < sockets.length; i++) {
		if (
			(type === "nick" && sockets[i].nick === user) ||
			(type === "trip" && sockets[i].trip === user)
		) {
			if (requiresTrip && typeof(sockets[i].trip) !== 'string') {
				continue;
			}

			return sockets[i];
		}
	}
	return null;
}



function getModifiedChannelName(name) {
	// Note: we prefix it with an ? to allow the claiming of channels like '__proto__' to happen without issue. since it's used as a key in an object
	return "?" + name;
}

// NOTE: this assumes the channel name is 'modified' appropiately.
function doesChannelHaveData (core, modChannelName) {
	return core.config[MODULE_NAME].hasOwnProperty(modChannelName);
}
function getChannelData (core, channelName) {
	let modChannelName = getModifiedChannelName(channelName);
	if (!doesChannelHaveData(core, modChannelName)) {
		core.config[MODULE_NAME][modChannelName] = {};
	}
	return core.config[MODULE_NAME][modChannelName];
}
function setChannelOwner(core, channelName, trip) {
	getChannelData(core, channelName).owner = trip;
}
function removeChannelOwner(core, channelName) {
	setChannelOwner(core, channelName, undefined);
}
function getChannelOwner (core, channelName) {
	return getChannelData(core, channelName).owner;
}
function channelHasOwner (core, channelName) {
	return typeof(getChannelOwner(core, channelName)) === 'string';
}
// If they directly own the channel.
function doesOwnChannel (core, channelName, trip) {
	if (channelHasOwner(core, channelName)) {
		let owner = getChannelOwner(core, channelName);

		if (owner === "mod" && (isMod(core, trip) || isAdmin(core, trip))) {
			return true;
		} else if (owner === "admin" && isAdmin(core, trip)) {
			return true;
		}
		return owner === trip;
	}
	return false;
}

// If they should have the same abilities as the owner.
function hasChannelOwnerPowers (core, channelName, trip) {
	return getUserRanking(core, channelName, trip) <= 0;
}

// Get the channel owner in a good displayable fashion
function getChannelOwnerDisplay (core, channelName, userTrip, useUserTrip=true) {
	let ownerText = "No-one";

	if (channelHasOwner(core, channelName)) {
		let owner = getChannelOwner(core, channelName);
		switch (owner) {
			case "mods":
				ownerText = "All Server Mods";
				break;
			case "admins":
				ownerText = "All Server Admins";
				break;
			case userTrip && useUserTrip:
				ownerText = "[You]";
				break;
			default:
				ownerText = `[${owner}]`;
				break;
		}
	}

	return ownerText;
}

function getUserRanking (core, channelName, userTrip) {
	if (isAdmin(core, userTrip)) {
		return -2;
	} else if (isMod(core, userTrip)) {
		return -1;
	} else if (doesOwnChannel(core, channelName, userTrip)) {
		return 0;
	} else {
		// No ranking, they are a normal user. Due to this being infinity you shouldn't store a user ranking
		// that's a bad idea anyway, what if it changes?
		return Infinity;
	}
}


// === Roles ===

// Note: 0 key is the default value for users
// a key that is higher is more 'privileged', allowing more access in some manner and is better.
// a lower number is less privileged.
// if you have TESTPERM={-1: "A", 0: "B", 1: "C", 2: "D"} B would be the default
// If you have no role      that sets this, then the value is B
// If you have a Role ZETA  that sets TESTPERM=B then the value is B
// If you have a Role MIKE  that sets TESTPERM=A and a Role Zeta that sets TESTPERM=B, then since B>A the value is B despite it being the default.
// If you have a Role GAMMA that sets TESTPERM=A then since A>nothing-set
// If you have a Role DELTA that sets TESTPERM=C then since C>nothing-set then the value is C
// If you have a Role ALPHA that sets TESTPERM=C, and a Role BETA that sets TESTPERM=D then since D>C then the value is D

const defaultPermissions = {
	// can they create new roles
	canDeclareRole: {
		0: false,
		1: false,
	},
	// can they send messages
	canTalk: {
		0: true,
		1: false,
	},
	// can they give roles to themselves and other.
	canGiveRoles: {
		0: false,
		1: true,
	},
	// Can they invite other users
	canInvite: {
		0: true,
		1: false,
	},
};

function getModifiedRoleName (roleName) {
	// If you modify this, modify getUnModifiedRoleName to match
	// Allows roles named such as __proto__ without issue
	return "$" + roleName.toLowerCase();
}
function getUnModifiedRoleName (modRoleName) {
	// If you modify this, modify getModifiedRoleName to match
	return modRoleName.slice(1);
}
function doesChannelHaveRolesProperty (core, channelName) {
	return getChannelData(core, channelName).hasOwnProperty('roles');
}
function isSpecialMRole (modRoleName) {
	return modRoleName === '$!USER';
}
function isSpecialRole (roleName) {
	return isSpecialMRole(getModifiedRoleName(roleName));
}
function getChannelRoles(core, channelName) {
	let channel = getChannelData(core, channelName);
	if (!doesChannelHaveRolesProperty(core, channelName)) {
		channel.roles = {
			'$!USER': {
				permissions: {},
			}
		};
	}
	return channel.roles;
}
function getChannelRolesCount (core, channelName) {
	return Object.keys(getChannelRoles(core, channelName)).length;
}
function getChannelRoleList (core, channelName) {
	return Object.keys(getChannelRoles(core, channelName)).map(getUnModifiedRoleName);
}
// Returns undefined if role does not exist
// Returns false if trip was not added, likely due to already being there
function addUserToMRole (core, channelName, modRoleName, trip) {
	if (!doesMRoleExist(core, channelName, modRoleName)) {
		return undefined;
	} else if (userHasMRole(core, channelName, trip, modRoleName)) {
		return false;
	}

	let role = getChannelMRole(core, channelName, modRoleName);
	role.trips.push(trip);

	return true;
}
function removeUserFromMRole (core, channelName, modRoleName, trip) {
	if (!doesMRoleExist(core, channelName, modRoleName)) {
		return undefined;
	} else if (!userHasMRole(core, channelName, trip, modRoleName)) {
		return false;
	}

	let role = getChannelMRole(core, channelName, modRoleName);
	let index = role.trips.indexOf(trip);
	if (index === -1) {
		// this should not happen..
		// TODO: think if this should throw an error, since it's not meant to happen.
		return false;
	}
	role.trips.splice(index, 1);

	return true;
}
// returns null if role does not exist
function getChannelMRole (core, channelName, modRoleName) {
	let roles = getChannelRoles(core, channelName);

	if (!roles.hasOwnProperty(modRoleName)) {
		return null;
	}

	return roles[modRoleName];
}
function doesMRoleExist (core, channelName, modRoleName) {
	return getChannelRoles(core, channelName).hasOwnProperty(modRoleName);
}
function doesRoleExist (core, channelName, roleName) {
	return doesMRoleExist(core, channelName, getModifiedRoleName(roleName));
}
function createChannelRole (core, channelName, roleName, force=false) {
	if (!force && (doesRoleExist(core, channelName, roleName) || !isValidRoleName(roleName))) {
		return false;
	}

	getChannelRoles(core, channelName)[getModifiedRoleName(roleName)] = {
		trips: [], // the trips which have this role.
		permissions: {}, // [permission name]: permission value
	};

	return true;
}
// Note: this returns roles in their stored form, not the form meant for reading
function getUserMRoles (core, channelName, trip) {
	let roles = getChannelRoles(core, channelName);
	let userRoles = [];

	for (let role in roles) {
		// TODO: do a check to make sure it has a trips property
		if (roles[role].trips.includes(trip)) {
			userRoles.push(role);
		}
	}
	userRoles.push('$!USER');

	return userRoles;
}
function getUserRoles (core, channelName, trip) {
	return getUserMRoles(core, channelName, trip).map(getUnModifiedRoleName);
}
function userHasMRole (core, channelName, trip, modRoleName) {
	if (modRoleName === undefined) throw Error("No rolename supplied");

	// TODO: make this work with modified and unmodified rolenames. currently only supports modified
	return getUserMRoles(core, channelName, trip).includes(modRoleName);
}
function doesPermissionExist (permission) {
	return defaultPermissions.hasOwnProperty(permission);
}
// Returns undefined if the permission does not exist
// Returns null if that value does not exist in the permissions
function findPermissionLevelFromValue (permission, value) {
	if (!doesPermissionExist(permission)) {
		return undefined;
	}

	for (let level in defaultPermissions[permission]) {
		if (defaultPermissions[permission][level] === value) {
			return level;
		}
	}

	return null;
}
// Returns undefined if permission does not exist
// Returns null if it does not have a default level
function getDefaultPermissionLevel (permission) {
	return getPermissionLevel(permission, 0);
}
// Returns undefined if permission does not exist
// Returns null if it does not have that level
function getPermissionLevel (permission, level) {
	if (!doesPermissionExist(permission)) {
		return undefined;
	}

	if (defaultPermissions[permission].hasOwnProperty(level)) {
		return defaultPermissions[permission][level];
	}

	return null;
}
// Returns value of permission. Returns undefined if the permission does not exist
function getUserPermission (core, channelName, trip, permission, expandDefault=false) {
	if (!doesPermissionExist(permission)) {
		return undefined;
	}

	let roles = getChannelRoles(core, channelName);
	let roleNames = getUserMRoles(core, channelName, trip);
	let masterLevel = "default";
	for (let i = 0; i < roleNames.length; i++) {
		let role = roles[roleNames[i]];

		if (role.hasOwnProperty("permissions")) {
			// note: role.permissions[permission] holds the level, not the value, so it's a digit
			if (role.permissions.hasOwnProperty(permission)) {
				if (masterLevel === "default") {
					masterLevel = role.permissions[permission];
				} else if (role.permissions[permission] > masterLevel) {
					masterLevel = role.permissions[permission];
				}
				// otherwise, ignore this permission value.
			}
		}
	}

	if (expandDefault && masterLevel === "default") {
		masterLevel = "0";
	}

	return masterLevel;
}
// returns empty array if permission does not exist
// NOTE: This is not guaranteed to be in the correct order!
function getPermissionValues (permission) {
	if (!doesPermissionExist(permission)) {
		return [];
	}

	return Object.values(defaultPermissions[permission]);
}
function isValidPermissionValue (permission, value) {
	if (value === undefined) {
		return false;
	}

	return getPermissionValues(permission).includes(value);
}
function setMRolePermissionLevel (core, channelName, modRoleName, permission, level) {
	if (level === undefined) {
		return false;
	}

	let role = getChannelMRole(core, channelName, modRoleName);

	if (role === undefined || role === null) {
		return false;
	}
	role.permissions[permission] = level;

	return true;
}
function getMRolePermissionLevel (core, channelName, modRoleName, permission) {
	let role = getChannelMRole(core, channelName, modRoleName);
	if (typeof(role) !== 'object') {
		return undefined;
	}
	let level = role.permissions[permission];

	if (level === undefined) {
		return "default";
	}
	return level;
}

exports.run = async (core, server, socket, data) => {
	console.log("VILLA RAN", data);

	let instructionName = data.instr || null;

	if (typeof(instructionName) !== "string") {
		return server.reply({
			cmd: 'warn',
			text: '`instr` property was not a string. If this occurred via typing in a command into the chat, report this.'
		}, socket);
	}

	if (exports.instr.hasOwnProperty(data.instr)) {
		await exports.instr[data.instr](core, server, socket, data);
	} else {
		return server.reply({
			cmd: 'warn',
			text: 'invalid `instr` command name. If this occurred via typing in a command into the chat, report this.'
		}, socket);
	}
};

exports.instr = {
	// Naming scheme: lower dashed case. Aka: 'claim channel' becomes 'claim-channel'

	'help': async (core, server, socket, data) => {
		return server.reply({
			cmd: 'info',
			text: 'Possible ' + MODULE_NAME + ' commands: ' + Object.keys(exports.instr).join(', ') + '.'
		}, socket);
	},

	'get-owner': async (core, server, socket, data) => server.reply({
		cmd: 'info',
		text: `Current Owner: ${getChannelOwnerDisplay(core, socket.channel, socket.trip)}`
	}, socket),

	'claim-channel': async (core, server, socket, data) => {
		let trip = socket.trip;

		if (typeof(trip) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: 'You require a trip to claim a channel.'
			}, socket);
		}

		let channel = socket.channel;

		// Yes, I could use the builtin usertype property, but this makes so they're calculated the same way
		// which will make it easier to make sure there's no issues.
		let incumbentType = getUserType(trip);
		let currentOwnerTrip = getChannelOwner(core, channel);
		let currentOwnerType = getUserType(currentOwnerTrip);

		// TODO: make a server option which decides if mods can claim user's channel.

		if (channelHasOwner(core, channel)) {
			if (doesOwnChannel(core, channel, trip)) {
				return server.reply({
					cmd: 'warn',
					text: "You already own this channel!"
				}, socket);
			} else if (currentOwnerType === incumbentType) { // same level, so user&user, mod&mod, admin&admin
				return server.reply({
					cmd: 'warn',
					text: "There is already an owner of this channel, with the trip: " + currentOwnerTrip
				}, socket);
			} else if ((currentOwnerType === 'user' && (incumbentType === 'mod' || incumbentType === 'admin')) || (currentOwnerType === 'mod' && incumbentType === 'admin')) {
				// if orig=user, and incumbent is mod or admin
				// or, if orig=mod and incumbent is admin
				server.broadcast({
					cmd: 'info',
					text: `The channel: ?${channel} has been forcefully taken over by an ${incumbentType}[${trip}] from ${currentOwnerTrip}.`
				}, { channel: channel });
				server.broadcast({
					cmd: 'info',
					text: `The channel: ?${channel} has been forcefully taken over by an ${incumbentType}[${trip}] from ${currentOwnerTrip}.`
				}, { uType: 'mod' })

				setChannelOwner(core, channel, trip);
			} else {
				return server.reply({
					cmd: 'warn',
					text: "There is already an owner of this channel, with the trip: " + currentOwnerTrip
				}, socket);
			}
		} else {
			server.broadcast({
				cmd: 'info',
				text: `This channel: ?${channel} is now owned by [${trip}] ${socket.nick}.`
			}, { channel: channel});
			setChannelOwner(core, channel, trip);
		}
	},

	'transfer-channel': async (core, server, socket, data) => {
		const channel = socket.channel;
		const trip = socket.trip;

		let transferTo = data.to;
		let transferType = data.type; // possible: 'nick' | 'trip'

		if (!channelHasOwner(core, channel)) { // channel has no owner
			return server.reply({
				cmd: 'warn',
				text: 'There is no owner for this channel, so it can not be transferred.',
			}, socket);
		} else if (typeof(trip) !== 'string') { // no trip
			return server.reply({
				cmd: 'warn',
				text: "You have no trip, thus you can not own this channel."
			}, socket);
		} else if (!doesOwnChannel(core, channel, socket.trip)) { // you don't own the channel
			return server.reply({
				cmd: 'warn',
				text: "You are not the owner of this channel, so you can not transfer it."
			}, socket);
		} else if (typeof(transferTo) !== 'string') { // does not have a person to transfer to
			return server.reply({
				cmd: 'warn',
				text: "Please choose a user to transfer the ownership of this channel to. (`to` property)"
			}, socket);
		}

		if (typeof(transferType) !== 'string') {
			transferType = 'nick';
		}
		if (transferType !== 'nick' && transferType !== 'trip') {
			return server.reply({
				cmd: 'warn',
				text: `There was a supplied Transfer-Type, but it was not of values: 'nick' or 'trip'. It was: ${transferType}`
			}, socket);
		}

		if (transferType === 'nick') {
			transferTo = purifyNick(transferTo);
		}

		if (
			(transferType === 'nick' && socket.nick === transferTo) ||
			(transferType === 'trip' && socket.trip === transferTo)
		) {
			return server.reply({
				cmd: 'warn',
				text: "Transferring ownership to yourself is a sign of narcissism."
			}, socket);
		}

		let userRecipient = findUserInChannel(server, channel, transferTo, transferType, true);

		if (userRecipient === null) {
			return server.reply({
				cmd: 'warn',
				text: "Did not find a user in the channel that this matched. The user is required to be in the channel, and have a trip. Nick/Trip are case-sensitive."
			}, socket);
		} else {
			return server.broadcast({
				cmd: 'info',
				text: `This channel's ownership was transferred from ${socket.nick} [${socket.trip}] to ${userRecipient.nick} [${userRecipient.trip}]`
			}, { channel: channel });
		}
	},

	'get-roles': async (core, server, socket, data) => {
		let channel = socket.channel;

		// First check is special case so we don't go around creating useless
		if (!doesChannelHaveData(core, getModifiedChannelName(channel)) || getChannelRolesCount(core, channel) === 0) {
			return server.reply({
				cmd: 'info',
				text: "There are no roles."
			}, socket);
		}

		return server.reply({
			cmd: 'info',
			text: "Roles: " + getChannelRoleList(core, channel)
		}, socket);
	},

	'get-user-roles': async (core, server, socket, data) => {
		let channel = socket.channel;
		let user = data.user;
		let userType = data.type || 'nick';

		if (userType !== 'nick' && userType !== 'trip') {
			return server.reply({
				cmd: 'warn',
				text: "The supplied type was neither 'nick' or 'trip'. Case-sensitive."
			}, socket);
		} else if (typeof(user) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "The supplied user was not a string, or it was not supplied. Please supply a user, and the type (nick/trip)."
			}, socket);
		}

		let foundUser = findUserInChannel(server, channel, user, userType, true);

		if (!foundUser) {
			return server.reply({
				cmd: 'warn',
				text: "Could not find user. They must have a trip to have roles. Perhaps you mispelt their nick/trip, or used the wrong 'type'?"
			}, socket);
		}

		let roles = getUserRoles(core, channel, foundUser.trip).join(', ');

		if (roles === "") {
			roles = "DOES NOT HAVE ANY";
		}

		return server.reply({
			cmd: 'info',
			text: `${foundUser.nick}'s roles: ${roles}`
		}, socket);
	},

	'get-role-count': async (core, server, socket, data) => {
		let channel = socket.channel;

		if (!doesChannelHaveData(core, getModifiedChannelName(channel))) {
			return server.reply({
				cmd: 'info',
				text: "Role-Count: 0"
			}, socket);
		}

		return server.reply({
			cmd: 'info',
			text: "Role-Count: " + getChannelRolesCount(core, channel)
		}, socket);
	},

	'declare-role': async (core, server, socket, data) => {
		// TODO: let those with the permission to declare roles be able to do so here

		let trip = socket.trip;
		let channel = socket.channel;
		let roleName = data.role;

		if (!hasChannelOwnerPowers(core, channel, trip)) {
			return server.reply({
				cmd: 'warn',
				text: "You do not have permission to create a role for this channel."
			}, socket);
		} else if (typeof(roleName) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "You must supply a name for the role to create."
			}, socket);
		} else if (doesRoleExist(core, channel, roleName)) {
			return server.reply({
				cmd: 'warn',
				text: "A role with that name already exists."
			}, socket);
		} else if (!isValidRoleName(roleName)) {
			return server.reply({
				cmd: 'warn',
				text: "That is not a valid rolename, sorry."
			}, socket);
		}

		// Note: yes this could be paired with the if-blocks above, but it feels clearer when it's seperate.
		if (!createChannelRole(core, channel, roleName)) {
			return server.reply({
				cmd: 'warn',
				text: "There was an unknown error creating the role. This should have been caught. Please report this."
			}, socket);
		} else {
			return server.reply({
				cmd: 'info',
				text: `The role named '${roleName}' was created.`
			}, socket);
		}
	},

	'add-role': async (core, server, socket, data) => {
		// TODO: add option for if it should alert the recipient
		let trip = socket.trip;
		let channel = socket.channel;

		let roleName = data.role;
		// Nick/trip to add the role to
		let addTo = data.to;
		// The type to consider addTo as
		let addType = data.type || 'nick';

		if (!hasChannelOwnerPowers(core, channel, trip)) {
			return server.reply({
				cmd: 'warn',
				text: "You do not have the required permissions to add a role."
			}, socket);
		} else if (typeof(roleName) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a role to add to a user!"
			}, socket);
		} else if (!doesRoleExist(core, channel, roleName)) {
			return server.reply({
				cmd: 'warn',
				text: `The role '${data.role}' does not exist.`
			}, socket);
		} else if (addType !== 'nick' && addType !== 'trip') {
			return server.reply({
				cmd: 'warn',
				text: "That is not a valid type. Please use 'nick' or 'trip'."
			}, socket);
		} else if (typeof(addTo) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a valid user-data to add a role too. (value depends on what type you chose, default type: 'nick')"
			}, socket);
		}

		if (addType === 'nick') {
			addTo = purifyNick(addTo);
		}

		let userRecipient = findUserInChannel(server, channel, addTo, addType, true);

		if (userRecipient === null) {
			return server.reply({
				cmd: 'warn',
				text: "Could not find the user you requested. Did you enter their nick/trip right? Did you enter the right data based on the supplied type? (Default: 'nick')"
			}, socket);
		} else if (userHasMRole(core, channel, userRecipient.trip, getModifiedRoleName(roleName))) {
			return server.reply({
				cmd: 'warn',
				text: "That user already has that role."
			}, socket);
		} else if (addUserToMRole(core, channel, getModifiedRoleName(roleName), userRecipient.trip)) {
			return server.reply({
				cmd: 'info',
				text: "Added trip."
			}, socket);
		} else {
			return server.reply({
				cmd: 'warn',
				text: "There was an issue adding the trip. Report this."
			}, socket);
		}
	},

	'remove-role': async (core, server, socket, data) => {
		// TODO: add option for if it should tell the victim
		let trip = socket.trip;
		let channel = socket.channel;

		let roleName = data.role;
		// Nick/trip to remove the role from
		let removeFrom = data.from;
		// The type to consider addTo as
		let removeType = data.type || 'nick';

		if (!hasChannelOwnerPowers(core, channel, trip)) {
			return server.reply({
				cmd: 'warn',
				text: "You do not have the required permissions to remove a role."
			}, socket);
		} else if (typeof(roleName) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a role to remove from a user!"
			}, socket);
		} else if (!doesRoleExist(core, channel, roleName)) {
			return server.reply({
				cmd: 'warn',
				text: `The role '${data.role}' does not exist.`
			}, socket);
		} else if (removeType !== 'nick' && removeType !== 'trip') {
			return server.reply({
				cmd: 'warn',
				text: "That is not a valid type. Please use 'nick' or 'trip'."
			}, socket);
		} else if (typeof(removeFrom) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a valid user-data to remove a role from. (value depends on what type you chose, default type: 'nick')"
			}, socket);
		}

		if (removeType === 'nick') {
			removeFrom = purifyNick(removeFrom);
		}

		let userRecipient = findUserInChannel(server, channel, removeFrom, removeType, true);

		if (userRecipient === null) {
			return server.reply({
				cmd: 'warn',
				text: "Could not find the user you requested. Did you enter their nick/trip right? Did you enter the right data based on the supplied type? (Default: 'nick')"
			}, socket);
		} else if (!userHasMRole(core, channel, userRecipient.trip, getModifiedRoleName(roleName))) {
			return server.reply({
				cmd: 'warn',
				text: "That user does not have that role."
			}, socket);
		} else if (removeUserFromMRole(core, channel, getModifiedRoleName(roleName), userRecipient.trip)) {
			return server.reply({
				cmd: 'info',
				text: "Removed trip."
			}, socket);
		} else {
			return server.reply({
				cmd: 'warn',
				text: "There was an issue removing the trip. Report this."
			}, socket);
		}
	},

	// TODO: Add function to destroy a role

	'get-role-permission': async (core, server, socket, data) => {
		// TODO: have a permission which makes so you can / can't get this
		let channel = socket.channel;
		let trip = socket.trip;
		let roleName = data.role;
		let permissionName = data.perm;
		let getDirect = data.stored === undefined ? false : data.stored;

		if (typeof(roleName) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a role."
			}, socket);
		} else if (!doesRoleExist(core, channel, roleName)) {
			return server.reply({
				cmd: 'warn',
				text: "That role does not exist."
			}, socket);
		} else if (typeof(permissionName) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a permission name."
			}, socket);
		} else if (!doesPermissionExist(permissionName)) {
			return server.reply({
				cmd: 'warn',
				text: "That permission does not exist."
			}, socket);
		}

		let level = getMRolePermissionLevel(core, channel, getModifiedRoleName(roleName), permissionName);
		if (level !== false && level !== undefined) {
			if (!getDirect) {
				level = getPermissionLevel(permissionName, level);
			}

			return server.reply({
				cmd: 'info',
				text: `Permission Level: ${level}`
			}, socket);
		} else {
			return server.reply({
				cmd: 'warn',
				text: "There was an issue getting the permission. Report this, please."
			}, socket);
		}
	},

	'set-role-permission': async (core, server, socket, data) => {
		let channel = socket.channel;
		let trip = socket.trip;
		let roleName = data.role;
		let permissionName = data.perm;
		// TODO: do some loose casting when you make this a /command so "true" -> true, "123" -> 123
		let value = data.to;

		if (!hasChannelOwnerPowers(core, channel, trip)) {
			return server.reply({
				cmd: 'warn',
				text: "You can not set a permission."
			}, socket);
		} else if (typeof(roleName) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a role to set the permission on."
			}, socket);
		} else if (!doesRoleExist(core, channel, roleName)) {
			return server.reply({
				cmd: 'warn',
				text: "That role does not exist."
			}, socket);
		} else if (typeof(permissionName) !== 'string') {
			return server.reply({
				cmd: 'warn',
				text: "Please supply a permission."
			}, socket);
		} else if (!doesPermissionExist(permissionName)) {
			return server.reply({
				cmd: 'warn',
				text: "That permission does not exist."
			}, socket);
		} else if (value === undefined) {
			return server.reply({
				cmd: 'warn',
				text: "Please include the value you want to set it to."
			}, socket);
		} else if (!isValidPermissionValue(permissionName, value)) {
			return server.reply({
				cmd: 'warn',
				text: "That is not a valid value."
			}, socket);
		}

		if (setMRolePermissionLevel(core, channel, getModifiedRoleName(roleName), permissionName, findPermissionLevelFromValue(permissionName, value))) {
			return server.reply({
				cmd: 'info',
				text: "Set permission level."
			}, socket);
		} else {
			return server.reply({
				cmd: 'warn',
				text: "There was an issue setting the permission. Report this, please."
			}, socket);
		}
	},

	// TODO: command to copy role-structure from another channel. Option to also copy the trips it's applied too.
};

exports.initHooks = (server) => {
	server.registerHook('in', 'chat', this.chatHook);
	server.registerHook('in', 'saveconfig', this.saveConfigHook);
	server.registerHook('in', 'invite', this.inviteHook);
};

exports.inviteHook = (core, server, socket, payload) => {
	let level = getPermissionLevel("canInvite", getUserPermission(core, socket.channel, socket.trip, "canInvite", true));

	if (level === false) {
		server.reply({
			cmd: 'warn',
			text: "You are not allowed to invite in this channel."
		}, socket);
		return false;
	}

	return payload;
};

exports.saveConfigHook = (core, server, socket, payload) => {
	// TODO: make a function to cleanup the data we store. Remove empty channels (no roles, no owner), etc.
	return payload;
};

exports.chatHook = (core, server, socket, payload) => {
	console.log("CHAT: ", payload);
	// TODO: Add method for running villa commands in chat
	return payload;
};

exports.info = {
	name: MODULE_NAME,
	description: "Allows management of ownership of channels and the like.",
	usage: `Unfinished.`,
};