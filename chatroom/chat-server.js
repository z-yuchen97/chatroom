// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	url = require('url'),
	path = require('path'),
	mime = require('mime'),
	path = require('path'),
	fs = require("fs"),
	xss = require("xss");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	var filename = path.join(__dirname, url.parse(req.url).pathname);
	(fs.exists || path.exists)(filename, function(exists){
		if (exists) {
			fs.readFile(filename, function(err, data){
				if (err) {
					// File exists but is not readable (permissions issue?)
					resp.writeHead(500, {
						"Content-Type": "text/plain"
					});
					resp.write("Internal server error: could not read file");
					resp.end();
					return;
				}
				
				// File exists and is readable
				var mimetype = mime.getType(filename);
				resp.writeHead(200, {
					"Content-Type": mimetype
				});
				resp.write(data);
				resp.end();
				return;
			});
		}else{
			// File does not exist
			resp.writeHead(404, {
				"Content-Type": "text/plain"
			});
			resp.write("Requested file not found: "+filename);
			resp.end();
			return;
		}
	});
});
app.listen(3456);

var roomlist=[];
var userlist=[];
var pwdlist=[];
var banlist=[];
var allSocket=[];
var alluserslist=[];
var exist=0;
var userexist=0;
var privatemsgpoint=0;
var founderjudge=0;
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.
	socket.on('login_server', function(data) {
		const nickname = xss(data["nickname"]);
		const socket_id = socket.id;
		if(alluserslist.indexOf(nickname) > -1){
			userexist=1;
		}else{
			userexist=0;
			alluserslist.push(nickname);
			let socketinfo =  {
				nickname:nickname,
				socket_id: socket_id
			}
			allSocket.push(socketinfo);
		}
		io.to(socket.id).emit("message_to_login",{nickname:nickname,userexist:userexist,roomlist:roomlist}) 
	});
	
	socket.on('roomlist_update', function(data) {
		const roomname = xss(data["roomname"]);
		for(let i=0;i<roomlist.length;i++){
			if(roomlist[i]==roomname){
				roomlist.splice(i,1);
			}
		}
		for(let j=0;j<userlist.length;j++){
			if(userlist[j].room==roomname){
				userlist.splice(j,1);
			}
		}
		io.sockets.emit('roomlist_update_request',{roomlist:roomlist});
	});
	
	socket.on('lobby', function(data) {
		io.sockets.emit("message_to_lobby",{message:data["message"], nicknames:data["nicknames"]}) // broadcast the message to other users
	});
	
	socket.on('message_to_room', function(data) {
		// This callback runs when the server receives a new message from the client.
		const roomname = xss(data["roomname"]);
		socket.join(roomname);
		io.sockets.in(roomname).emit("feedback_to_room",{roomname:roomname, message:data["message"], nicknames:data["nicknames"]}) 
	});
	
	socket.on('information_of_room', function(data) {
		// This callback runs when the server receives a new message from the client.
		const roomname = xss(data["roomname"]);
		const nickname = xss(data["nickname"]);
		const password = xss(data["password"]);
		if(roomlist.indexOf(roomname) > -1){ //room has already exist
			exist=1;
		}else{
			exist=0;
			let user =  {
			    room: roomname,
				nicknames:nickname,
				founder: "yes",
				ban_kick:"yes"
			}
			roomlist.push(roomname);
			pwdlist.push(password);
			userlist.push(user);
			socket.join(data["roomname"]);
		}
		// log it to the Node.JS output
		socket.emit("room_judge",{roomname:roomname,roomlist:roomlist,exist:exist,nickname:nickname,userlist:userlist,password:password})
	});
	
	socket.on('update_joinroom', function(data) {
		const roomname = xss(data["roomname"]);
		const nickname = xss(data["nickname"]);
	    socket.broadcast.to(roomname).emit("update_to_room",{roomname:roomname, nickname:nickname,userlist:userlist}) 
	});
	
	socket.on('leave_from_room', function(data) {
		const nicknames = xss(data["nicknames"]);
		const roomname = xss(data["roomname"]);
		const foundername = xss(data["foundername"]);
		if(foundername==nicknames){
			io.sockets.in(roomname).emit("dismiss_judge",{roomname:roomname,foundername:foundername})
		}else{
			socket.leave(roomname);
			for(let i=0; i < userlist.length; i++){
				if(userlist[i].nicknames==nicknames){
					userlist.splice(i,1);
				}
			}
			// log it to the Node.JS output
			socket.emit("leave_judge",{roomname:roomname,nicknames:nicknames})
		}
	});
	
	socket.on('dismiss_message', function(data) {
		const roomname = xss(data["roomname"]);
		const foundername = xss(data["foundername"]);
		for(let i=0; i < userlist.length; i++){
			if(userlist[i].room==roomname){
				userlist.splice(i,1);
			}
		}	
		for(let j=0; j < roomlist.length; j++){
			if(roomlist[j]==roomname){
				roomlist.splice(j,1);
				pwdlist.splice(j,1);
				break;
			}
		}
		io.in(roomname).emit("dismiss_judge",{roomname:roomname,foundername:foundername})
	});
	
	socket.on('leave_update', function(data) {
		const nickname = xss(data["nickname"]);
		const roomname = xss(data["roomname"]);
		socket.broadcast.to(roomname).emit("leave_to_update",{roomname:roomname,nickname:nickname,userlist:userlist})
	});
	
	socket.on('information_of_joinroom', function(data) {
		// This callback runs when the server receives a new message from the client.
		const roomname = xss(data["roomname"]);
		const nickname = xss(data["nickname"]);
		const password = xss(data["password"]);
		let ban_name = "";
		const index = roomlist.findIndex(function(value, index, arr) {
                      return value == roomname;
        });
		for(let i=0; i < banlist.length; i++){
			if(banlist[i].room==roomname){
				if(banlist[i].banname==nickname){
					ban_name = banlist[i].banname;
				}
			}
		}
		if(roomlist.indexOf(roomname) == -1){  //room did not exist
			exist=0;
		}else if(ban_name==nickname){
			exist=3;
		}else if(ban_name!=nickname && password == pwdlist[index]){  //room exist
			exist=1;
			let user =  {
			    room: roomname,
				nicknames:nickname,
				founder:"no",
				ban_kick:"no"
			}
			userlist.push(user);
			socket.join(roomname);
		}else if(password != pwdlist[index]){
			exist=2;
		}
		// log it to the Node.JS output
		socket.emit("joinroom_judge",{roomname:roomname,exist:exist,nickname:nickname,userlist:userlist})
	});
	
	socket.on('information_of_ban', function(data) {
		// This callback runs when the server receives a new message from the client.
		const banname = xss(data["banname"]);
		const roomname = xss(data["roomname"]);
		const nickname = xss(data["nickname"]);
		let banpoint=0;
		for(let i=0; i < userlist.length; i++){
		    if(userlist[i].nicknames==banname){
			    banpoint=1;
		    }
		}
		if(banpoint!=1){
			for(let i=0; i < banlist.length; i++){
			    if(banlist[i].room==roomname){
					if(banlist[i].banname==banname){
						banpoint=2;
					}
			    }
			}
		}
		if(banpoint!=1 && banpoint!=2){
				banpoint=0;
				let banuser =  {
				    room: roomname,
				 	banname:banname
				}
				banlist.push(banuser);
		}
		socket.emit("ban_alert",{banpoint:banpoint,banname:banname})
	});
	
	socket.on('cancel_ban', function(data) {
		// This callback runs when the server receives a new message from the client.
		const liftname = xss(data["liftname"]);
		const roomname = xss(data["roomname"]); 
		const nickname = xss(data["nickname"]); 
		let banpoint=0;
		for(let i=0; i < banlist.length; i++){
			if(banlist[i].room==roomname){
				if(banlist[i].banname==liftname){
					banlist.splice(i,1);
					banpoint=1;
				}
			}
		}
		if(banpoint!=1){
			banpoint=0;
		}
		socket.emit("cancel_result",{banpoint:banpoint,liftname:liftname})
	});
	
	socket.on('logout_ask', function(data) {
		// This callback runs when the server receives a new message from the client.
		const nickname = xss(data["nickname"]);
		for(let i=0; i < alluserslist.length; i++){
			if(alluserslist[i]==nickname){
				alluserslist.splice(i,1);
				break;
			}
		}
		for(let j=0;j<allSocket.length;j++){
			if(allSocket[j].nickname==nickname){
				const id = allSocket[j].socket_id;
				allSocket.splice(j,1);
				io.to(id).emit("logout_alert",{nickname:nickname})
				break;
			}
		}
	});
	
	socket.on('kickout_ask', function(data) {
		// This callback runs when the server receives a new message from the client.
		const kickname = xss(data["kickname"]);
		const roomname = xss(data["roomname"]);
		const nickname = xss(data["nickname"]);
		let kickoutpoint=1;
		for(let i=0; i < userlist.length; i++){
			if(userlist[i].room==roomname){
				if(userlist[i].nicknames==kickname){
					if(userlist[i].ban_kick=="no"){
						kickoutpoint=0;
						userlist.splice(i,1);
						break;
					}
				}
			}	
		}
		if(kickoutpoint!=0){
			for(let i=0; i < userlist.length; i++){
				if(userlist[i].room==roomname){
					if(userlist[i].nicknames==kickname){
						if(userlist[i].ban_kick=="yes"){
							kickoutpoint=2;
							break;
						}
					}
				}	
			}	
		}
		if(kickoutpoint!=0 && kickoutpoint!=2){
			kickoutpoint=1;
		}
		socket.emit("kickout_alert",{kickname:kickname,kickoutpoint:kickoutpoint})
	});
	
	socket.on('userout_apply', function(data) {
		// This callback runs when the server receives a new message from the client.
		const kickname = xss(data["kickname"]);
		const foundername = xss(data["foundername"]);
		const roomname = xss(data["roomname"]);
		for(let j=0;j<allSocket.length;j++){
			if(allSocket[j].nickname==kickname){
				const id = allSocket[j].socket_id;
				io.to(id).emit("userout_alert",{kickname:kickname,foundername:foundername,roomname:roomname})
				break;
			}
		}
	});
	
	socket.on('roomspace_update', function(data) {
		const roomname = xss(data["roomname"]);
		socket.leave(roomname);
	});
	
	socket.on('kickout_update', function(data) {
		// This callback runs when the server receives a new message from the client.
		const kickname = xss(data["kickname"]);
		const roomname = xss(data["roomname"]);
		io.sockets.in(roomname).emit("kick_out_update",{roomname:roomname,kickname:kickname,userlist:userlist})
	});
	
	socket.on('private_msg_send', function(data) {
		const privatemessage = xss(data["privatemessage"]);
		const privatename = xss(data["privatename"]);
		const sendername = xss(data["sendername"]);
		const roomname = xss(data["roomname"]);
		for(let i=0; i < userlist.length; i++){
			if(userlist[i].room==roomname){
				if(userlist[i].nicknames==privatename){
				   privatemsgpoint=0;
				   break;
				}else{
				   privatemsgpoint=1;
				}
			}else{
				privatemsgpoint=1;
			}
		}
		socket.emit("privatemsg_to_sender",{privatemessage:privatemessage,privatename:privatename,sendername:sendername,roomname:roomname,privatemsgpoint:privatemsgpoint})
	});
	
	socket.on('private_msg_receive', function(data) {
		const privatemessage = xss(data["privatemessage"]);
		const privatename = xss(data["privatename"]);
		const sendername = xss(data["sendername"]);
		const roomname = xss(data["roomname"]);
		for(let j=0;j<allSocket.length;j++){
			if(allSocket[j].nickname==privatename){
				const id = allSocket[j].socket_id;
				io.to(id).emit("privatemsg_to_receiver",{privatemessage:privatemessage,privatename:privatename,sendername:sendername,roomname:roomname})
				break;
			}
		}
	});
	
	socket.on('pull_request', function(data) {
		const pullman = xss(data["pullman"]);
		const founder = xss(data["founder"]);
		const roomname = xss(data["roomname"]);
		const password = xss(data["password"]);
		let pullpoint=0;
		for(let i=0; i < userlist.length; i++){
			if(userlist[i].room==roomname){
				if(userlist[i].nicknames==pullman){
				   pullpoint=1;
				   socket.emit("pull_repetition",{pullman:pullman})
				   break;
				}
			}	
		}
		if(pullpoint!=1){
			for(let i=0; i < banlist.length; i++){
				if(banlist[i].room==roomname){
					if(banlist[i].banname=pullman){
						pullpoint=2;
						socket.emit("ban_reason",{pullman:pullman})
					}
				}
			}
		}
		if(pullpoint!=1 && pullpoint!=2){
			for(let k=0; k < userlist.length; k++){
				if(userlist[k].nicknames==pullman){
					if(userlist[k].room!=roomname){
						pullpoint=3;
						socket.emit("grab_failure",{pullman:pullman})
					}
				}
			}
		}
		if(pullpoint!=1 && pullpoint!=2 && pullpoint!=3){
			for(let j=0; j < alluserslist.length; j++){
				if(alluserslist[j]==pullman){
					pullpoint=4;
					for(let m=0;m<allSocket.length;m++){
						if(allSocket[m].nickname==pullman){
							const id = allSocket[m].socket_id;
							io.to(id).emit("pull_apply",{founder:founder,roomname:roomname,pullman:pullman,password:password})
							break;
						}
					}
				}
			}
		}
		if(pullpoint!=1 && pullpoint!=2 && pullpoint!=3 && pullpoint!=4){
			socket.emit("pull_failure",{pullman:pullman})
		}
	});
	
	socket.on('change_password', function(data) {
		const roomname = xss(data["roomname"]);
		const newpassword = xss(data["newpassword"]);
		const oldpassword = xss(data["oldpassword"]);
		const index = roomlist.findIndex(function(value, index, arr) {
	                  return value == roomname;
	    });
		if(pwdlist[index]==oldpassword){
			pwdlist[index] = newpassword;
		}
		for(let i=0;i<userlist.length;i++){
			if(userlist[i].room==roomname){
				if(userlist[i].ban_kick=="yes"){
					const administratorname = userlist[i].nicknames;
					for(let m=0;m<allSocket.length;m++){
						if(allSocket[m].nickname==administratorname){
							const id = allSocket[m].socket_id;
							io.to(id).emit("changepwd_judge",{newpassword:newpassword})
						}
					}
				}
			}
		}
	});
	
	socket.on('authorize_rights', function(data) {
		const authorizename = xss(data["authorizename"]);
		const roomname = xss(data["roomname"]);
		const foundername = xss(data["foundername"]);
		const password = xss(data["password"]);
		let authorizepoint=0;
		for(let i=0; i < userlist.length; i++){
			if(userlist[i].room==roomname){
				if(userlist[i].nicknames==authorizename){
					if(userlist[i].ban_kick=="no"){
						authorizepoint=1;
						userlist[i].ban_kick="yes";
						for(let m=0;m<allSocket.length;m++){
							if(allSocket[m].nickname==authorizename){
								const id = allSocket[m].socket_id;
								io.to(id).emit("authorize_apply",{foundername:foundername,roomname:roomname,authorizename:authorizename,password:password})
							}
						}
					}
				}
			}
		}
		if(authorizepoint!=1){
			for(let i=0; i < userlist.length; i++){
			    if(userlist[i].room==roomname){
				    if(userlist[i].nicknames==authorizename){
					    if(userlist[i].ban_kick=="yes"){
						    authorizepoint=2;
						    socket.emit("authorize_repetition",{authorizename:authorizename})
					    }
				    }
			    }
			}	
		}
		if(authorizepoint!=1 && authorizepoint!=2){
			for(let i=0; i < userlist.length; i++){
			    if(userlist[i].nicknames==authorizename){
				    if(userlist[i].room!=roomname){
					    authorizepoint=3;
					    socket.emit("authorize_transboundary",{authorizename:authorizename})
				    }
			    }
			}	
		}
		if(authorizepoint!=1 && authorizepoint!=2 && authorizepoint!=3){
			authorizepoint=0;
			socket.emit("authorize_wrong",{authorizename:authorizename})
		}
	});
	
	socket.on('disconnect', function(data) {
		  let disconnectpoint = 1;
		  let nickname="";
		  for(let m=0;m<allSocket.length;m++){
			  if(allSocket[m].socket_id==socket.id){
				  nickname = allSocket[m].nickname;
				  console.log(nickname);
				  allSocket.splice(m, 1);
				  break;
			  }
		  }
		  const index = alluserslist.findIndex(function(value, index, arr) {
		                return value == nickname;
		  });
		  alluserslist.splice(index, 1);
		  for(let i=0; i < userlist.length; i++){
		  	 if(userlist[i].nicknames==nickname){
				if(userlist[i].founder=="yes"){
					const roomname = userlist[i].room;
					disconnectpoint=0;
					io.sockets.in(roomname).emit('dismiss_room',{roomname:roomname,foundername:nickname})
					break;
				}
		  	 }	
		  }
		  if(disconnectpoint!=0){
			  for(let i=0; i < userlist.length; i++){
			  	 if(userlist[i].nicknames==nickname){
			  		if(userlist[i].founder=="no"){
			  			const roomname = userlist[i].room;
			  			userlist.splice(i, 1);
			  			disconnectpoint=1;
			  			socket.broadcast.to(roomname).emit("leave_to_update",{roomname:roomname,nickname:nickname,userlist:userlist})
			  			break;
			  	    }
			  	 }	
			  }
		  }
	   });
});

