const mySQLConnection=
{
    client: 'mysql',
    connection: {
        host: process.env.DBHOST,
        user: process.env.DBUSER,
        password: process.env.DBPASSWORD,
        database: process.env.DBDATABASE
    }
};
module.exports = mySQLConnection;
