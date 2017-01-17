var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt');
var sessions = require('client-sessions');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

/************************************************************/
// Middleware
/************************************************************/

app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(sessions({
  cookieName: 'session',
  secret: 'peanutbutterjellytime',
  duration: 24 * 60 * 60 * 1000,
  activeDuration: 5 * 60 * 1000
}));

// Investigate how this is working a bit better
app.use(function(req, res, next) {
  if (req.session && req.session.user) {
    new User({username: req.session.user}).fetch().then(function(user) { 
      next();
    }).catch(function(err) {
      res.redirect('/signup');
    });
  }
});


/************************************************************/
// Routing
/************************************************************/

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/login', function(req, res) {
  if (req.session.user) {
    res.render('/');
  }
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/create', function(req, res) {
  res.render('index');
});

app.get('/links', function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/signup', function(req, res) {
  bcrypt.hash(req.body.password, 10, function(err, hash) {
    if (err) {
      console.log(err);
    }
    var newUser = new User({
      username: req.body.username,
      password: hash
    });
    newUser.save().then(function(model) {
      console.log('new user created');
      res.status(201).redirect('/');
    }).catch(function(err) {
      if (err.errno === 19) {
        console.log('user already exists, please login');
        res.redirect('/login');
      }
    });
  });
});

app.post('/login', function(req, res) {
  new User({username: req.body.username}).fetch().then(function(user) {
    if (!user) {
      console.log('User doesnt exist');
      res.redirect('/signup');
    } else {
      bcrypt.compare(req.body.password, user.attributes.password, function(err, result) {
        if (result) {
          console.log('Password is correct');
          req.session.user = user;
          res.redirect('/');
        } else {
          console.log('Password doesn\'t match');
          res.redirect('/login');
        }
      });
    }
  });
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/






/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
