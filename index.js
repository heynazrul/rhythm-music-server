const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(
  'sk_test_51NIRnuCm9CwAEL5Y8iEh4ERY3VgKdWqXBo2vLHvASohIG4D685a6UJWpt7AZQOpEa1wdyVdRBo4D5IW2NciuwkyI007S3jamKZ',
  {
    maxNetworkRetries: 2, // Retry a request twice before giving up
  }
);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }

  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access!' });
    }

    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4zbzvmu.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollection = client.db('rhythmDB').collection('users');
    const classesCollection = client.db('rhythmDB').collection('classes');
    const paymentsCollection = client.db('rhythmDB').collection('payments');

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // middleware to verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden access!' });
      }
      next();
    };

    // middleware to verify instructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden access!' });
      }
      next();
    };

    // middleware to verify student
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'student') {
        return res.status(403).send({ error: true, message: 'forbidden access!' });
      }
      next();
    };

    // =======================/     /=============================================
    //                      USER RELATED
    // ========================/    /===========================================

    // users related API
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user exists in user Database' });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Check admin user role
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    });

    // check instructor user role
    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' };
      res.send(result);
    });

    // check student user role
    app.get('/users/student/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ student: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { student: user?.role === 'student' };
      res.send(result);
    });

    // update user role by ***ADMIN***
    app.patch('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin',
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // update user role by ***INSTRUCTOR***
    app.patch('/users/instructor/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'instructor',
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // add Student selected classId in user database
    app.patch('/users/selectedClassId/:email', async (req, res) => {
      const email = req.params.email;
      const classId = req.body.classId;
      console.log(email, classId);
      const filter = { email: email };
      const updateDoc = {
        $addToSet: {
          selectedClassId: classId,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // get selected classId by of requested user
    app.get('/users/selectedClassId/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const selectedClassId = user.selectedClassId;
      // console.log(!selectedClassId);
      // if(!selectedClassId) {
      //   return
      // }
      const convertedId = selectedClassId.map((id) => new ObjectId(id));
      // console.log(convertedId);
      const result = await classesCollection.find({ _id: { $in: convertedId } }).toArray();
      res.send(result);
    });

    // student only route get enrolled class
    app.get('/student/enrolled-classes/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const enrolledClassId = user.enrolledClassId;
      const convertedId = enrolledClassId.map((id) => new ObjectId(id));
      const result = await classesCollection.find({ _id: { $in: convertedId } }).toArray();
      res.send(result);
    });

    // get all instructors
    app.get('/instructors', async (req, res) => {
      const result = await usersCollection.find({ role: 'instructor' }).toArray();
      res.send(result);
    });

    // =======================/     /=============================================
    //                      CLASS RELATED API
    // ========================/    /===========================================

    // Get all classes data
    app.get('/classes', async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    // get only APPROVED classes
    app.get('/approved-classes', async (req, res) => {
      const result = await classesCollection.find({ status: 'approved' }).toArray();
      res.send(result);
    });

    // add new class to database ==> by verifying instructor
    app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    // update class status "approved" ==> by verifying admin
    app.patch('/classes/approved/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'approved',
        },
      };
      const result = await classesCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // update class status "denied" ==> by verifying admin
    app.patch('/classes/denied/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'denied',
        },
      };
      const result = await classesCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // send feedback to instructor ==> by verifying admin
    app.patch('/classes/feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const feedback = req.body.feedback;
      console.log(id, feedback);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };
      const result = await classesCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // =======================/     /=============================================
    //                      PAYMENT RELATED API
    // ========================/    /===========================================

    // create payment intent verify user and verify student
    app.post('/create-payment-intent', verifyJWT, verifyStudent, async (req, res) => {
      const { price } = req.body;
      const amount = parseFloat(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // store payment data by only student
    app.post('/student/payments', verifyJWT, verifyStudent, async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);

      // Update the class collection
      const classId = payment.classId;
      await classesCollection.updateOne({ _id: new ObjectId(classId) }, { $inc: { seats: -1, enrolled: 1 } });

      // Update the user collection
      const userEmail = payment.email;
      const query = { email: userEmail };
      const updateSelectedClassId = {
        $pull: {
          selectedClassId: classId,
        },
        $push: {
          enrolledClassId: classId,
        },
      };
      await usersCollection.updateOne(query, updateSelectedClassId);

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Rhythm music server is running');
});

app.listen(port, () => {
  console.log(`Rhythm music server is running on port ${port}`);
});
