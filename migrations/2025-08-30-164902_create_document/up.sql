-- Your SQL goes here
CREATE TABLE document (
    id serial primary key,
    title varchar(255) not null,
    content text not null,
    created_at timestamp default current_timestamp
);
