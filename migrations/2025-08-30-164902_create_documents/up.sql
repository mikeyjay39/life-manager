-- Your SQL goes here
CREATE TABLE documents (
    id serial primary key,
    title varchar(255) not null,
    content text not null
);
