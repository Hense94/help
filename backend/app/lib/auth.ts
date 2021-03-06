import * as crypto from "crypto";
import { Role, User } from "../models/user";
import { Request, RequestHandler } from "express";
import { AuthTokenFootprint } from "../models/authToken";
import { Database } from "../database";
import { r } from "rethinkdb-ts";
import { HelpResponse } from "./responses";

export const getUser = (request: Request): User => {
    return (request as any)._user as User;
};

export const userRoleIn = (user: User, roles: Role[]): boolean => {
    return roles.includes(user.role);
};

export const userRole = (request: Request): Role => {
    return getUser(request).role;
};

export const userIsAssociatedWithCourse = async (user: User, departmentSlug: string, courseSlug: string) => {
    return await Database.courses.filter({
        departmentSlug: departmentSlug,
        slug: courseSlug
    })('associatedUserIDs').contains(function(idList) { return idList.contains(user.id ? user.id : null) }).run(Database.connection);
};

export const generateToken = ():string => {
    return crypto.randomBytes(64).toString('hex');
};

export const hash = (data: string):string => {
    return crypto.createHash('sha256').update(data).digest('hex');
};

export const AuthMiddleware:RequestHandler = async (request, response, next) => {
    let token = request.header('auth-token');

    async function failHandle(token: string | undefined) {
        // return a null user
        let user = {
            anon: true,
            id: '',
            email: '',
            name: '',
            role: 'student'
        };
        if (token) {
            user.id = await r.uuid(token).run(Database.connection);
        } else {
            user.id = await r.uuid().run(Database.connection);
        }
        (request as any)._user = (user as any);
        return next();
    }

    // if user tries to authenticate
    if (!token) {
        return failHandle(undefined);
    }

    token = hash(token);

    // retrieve the correct auth token from the database for comparison
    const footprint = (await Database.db.table('authTokens').get(token)
    .run(Database.connection) as AuthTokenFootprint);
    
    // if we didn't find anything
    if (!footprint) {
        return failHandle(token);
    }

    let now = await r.now().run(Database.connection);
    // If auth token has expired
    if (now > footprint.expiration) {
        return failHandle(token);
    }

    // get user from database and save in request to pass on
    (request as any)._user = await Database.users.get(footprint.userID).run(Database.connection);

    // validate users role
    if(!userRoleIn(getUser(request), ['student', 'TA', 'lecturer', 'admin'])) {
        return HelpResponse.error(response, "Unknown user role");
    }
    return next();
};
