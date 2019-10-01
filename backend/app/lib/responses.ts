import { Response, RequestHandler } from 'express';
import { validationResult } from 'express-validator';

export const schemaErrorHandler: RequestHandler = (request, response, next) => {
    let  schemaErrors = validationResult(request);
    if(schemaErrors.isEmpty())
        return next();
    
    HelpResponse.error(response, schemaErrors.array());
}

export class HelpResponse {
    static jsonWrap(payload: any) {
        return JSON.stringify(payload) + '\n';
    }

    static successWrap(payload: any, success = true): any {
        return this.jsonWrap({
                success: success,
                data: payload
            });
    }

    static fromPromise(response: Response, promise: Promise<any>) {
        promise
        .then( result => 
            HelpResponse.success(response, result)
        )
        .catch( error => 
            HelpResponse.error(response, error) 
        );
    }
    public static disallowed(response: Response) {
        this.error(response, "Disallowed", 403);
    };

    public static success(response: Response, payload: any) {
        response.send(this.successWrap(payload));
    }
    
    public static error(response: Response, error: any = "Internal server error", errorCode = 500) {
        response.status(errorCode).send(this.successWrap(error, false));
    };
}