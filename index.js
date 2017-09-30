const express = require('express')
const bodyParser = require('body-parser')
const store = require('./store')
const app = express()
const flash = require('connect-flash')
const cookieParser = require('cookie-parser')
const util = require('util')
const session = require('express-session')
const fileUpload = require('express-fileupload');
var sendmail = require('sendmail')();

//to be able to receive data from the html form
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(fileUpload());

app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(cookieParser('secretString'));
app.use(session({cookie: { maxAge: 60000 }}));
app.use(flash());

var AWS = require('aws-sdk');
AWS.config.region = 'eu-west-1';

var credentials = new AWS.SharedIniFileCredentials({profile: 'sandbox'});
AWS.config.credentials = credentials;

var s3 = new AWS.S3();
var dynamodb = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient();

var approvers = "ariane.gadd@gmail.com"

var bucket  = "ag-project-bucket"
var tablename = "AGProject"
var signedUrlExpireSeconds = 60*5
var link 

var file 

app.get('/', function(req, res) {
        res.render('index.ejs', { message: req.flash('loginMessage') });
    });

//app.get('/login', function(req, res) {

        //res.render('login.ejs', { message: req.flash('loginMessage') }); 
    //});

//app.get('/createUser', function(req, res) {

        //res.render('createUser.ejs', { message: req.flash('signupMessage') }); 
    //});

app.get('/signup', function(req, res) {
        res.render('signup.ejs', { message: req.flash('signupMessage') });
    });

app.get('/profile', isLoggedIn, function(req, res) {
        res.render('profile', {
            user : req.user
        });
    });

app.get('/logout', function (req, res, next) {
    delete req.isAuthenticated;
    res.redirect('/');
  });

app.get('/ToValidate', function (req, res) {
  
  
  res.setHeader('Access-Control-Allow-Origin','*');
  
  console.log("Querying Items to validate.");
  
  //query items that need to be validated
  var params = {
    TableName : tablename,
    FilterExpression: "#st = :stname",
    ExpressionAttributeNames:{
      "#st": "Status"
    },
    ExpressionAttributeValues: {
      ":stname": "ToValidate"
    }
  };

docClient.scan(params, function(err, data) {
    if (err) {
      console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
    } else {
      console.log("Query succeeded.");
      
      res.send(data);
      console.log(data.Items)
    }
  });
})

app.get('/', function (req, res) {

res.send("Api to manage extractions from buckets")

})

app.post("/file", function(req, res) {
    res.setHeader('Access-Control-Allow-Origin','*');
  
 // console.log(req);
 var authorizerCode =  Math.random().toString(36).substring(7);
  
  console.log(req.files.file)


  if (!req.files)
  return res.status(400).send('No files were uploaded.');
  
    var filename = (Math.random().toString(36).substring(7) + "-" + req.files.file.name).toString()
    filename= filename.replace(/ +/g, "");
    console.log(filename);

  // email of the final destination 
  
  var email  = req.body.email
  
  //upload the file to s3
  var fileuploadparams = {
    Bucket : bucket,
    Key : filename,
    Body : req.files.file.data
  }
  
  s3.upload(fileuploadparams, function (err, data) {
    
    if (err) {
      console.log("error") ;
      return res.status(400).send('Error Uploading the files');
    }else {

params1 = {Bucket: bucket, Key: filename,}

var url = s3.getSignedUrl('getObject', params1,function (err, url) {
console.log('Signed URL: ' + url)
link = url 

})



      console.log("uploaded")



console.log(url);
      
    

      var params = {
        Item: {
          "KeyName": {
            S: filename
          }, 
          "Status": {
            S: "ToValidate"
          },
          "Destination" : {
            S: req.body.email
          },
          "AuthorizerCode" : {
            S: authorizerCode
          }
        }, 
        ReturnConsumedCapacity: "TOTAL", 
        TableName: tablename
      };
      dynamodb.putItem(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else      {
          
          res.render('profile', {
            user : req.user
        });
          console.log(data); 
        
           
sendmail({
    from: 'no-reply@kpmg.co.uk ',
    to: approvers,
    subject: "Approve extraction of file"  ,
    html: 'Please approve the extaction of the file' + req.files.file.name + " the final destination will be " + req.body.email + " <br /> Link to see the file : " + link +  " <br /> code to authorize it " + authorizerCode
  }, function(err, reply) {
    console.log(err && err.stack);
    console.dir(reply);
});
    
   }          // successful response
          
        });
        
        
      }
      
    })
    
    
    
  })
  
  
  app.get("status", function (req, res){
    
    //Send json with the status of the files 
    
    
  })
  
  app.post("/authorize", function (req, res) {
    
    //  check / write on dynamo db the data and send the temp link
  res.setHeader('Access-Control-Allow-Origin','*');
    var email_authorizer  = req.body.authorizer
    var code = req.body.code
    var filename = req.body.key 
    
    console.log(filename)


var params = {
    TableName : tablename,
    KeyConditionExpression: "#fn = :filename",
    ExpressionAttributeNames:{
        "#fn": "KeyName"
    },
    ExpressionAttributeValues: {
        ":filename":req.body.key 
    }
};

docClient.query(params, function(err, data) {
    if (err) {
        console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
    } else {
        console.log("Query succeeded.");
        console.log(data);

file = data.Items[0]
if (file) {  
        if (file.AuthorizerCode == code )  {

          console.log("user authorized")

          params_link = {Bucket: bucket, Key: filename,}

var url = s3.getSignedUrl('getObject', params_link,function (err, url) {
console.log('Signed URL: ' + url)
link = url 
})

sendmail({
    from: 'no-reply@kpmg.co.uk ',
    to: data.Items[0].Destination,
    subject: "File from AWS"  ,
    html: link
  }, function(err, reply) {
    console.log(err && err.stack);
    console.dir(reply);
});
  res.send("file realeased ")

var del = {
    TableName:tablename,
    Key:{
        "KeyName" : file.KeyName,
        "Status" : "ToValidate"
    }
};

docClient.delete(del, function(err, data) {
    if (err) {
        console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        console.log("DeleteItem succeeded:", JSON.stringify(data, null, 2));
    }
});



      var params = {
        Item: {
          "KeyName": {
            S: file.KeyName
          }, 
          "Status": {
            S: "Validated"
          },
          "Destination" : {
            S: file.Destination
          },
          "AuthorizerCode" : {
            S: file.AuthorizerCode
          }
        }, 
        ReturnConsumedCapacity: "TOTAL", 
        TableName: tablename
      };
      dynamodb.putItem(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else{ 
          console.log(data); 
            } } ) 



        } else {

          res.send("wrong code")
        }


    }else (
      res.send("wrong code")
    )
    }
});  

  })


//app.post('/createUser', (req, res) => {

  //console.log(req.body);
  //store
    //.createUser({
      //username: req.body.username,
      //password: req.body.password
    //})
    //.then(() => res.render('profile'))
//})

app.post('/login', (req, res) => {
  store
    .authenticate({
      username: req.body.username,
      password: req.body.password
    })
    .then(({ success }) => {
      if (success) res.render('profile')
      else {
      req.flash('loginMessage', 'Invalid credentials.');
      res.redirect('/');
      }   
    })
})

app.post('/signup', (req, res) => {
  var email_authorizer  = req.body.authorizer
})

app.listen(7555, () => {
  console.log('Server running on http://localhost:7555')
})

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();
    res.redirect('/');
}