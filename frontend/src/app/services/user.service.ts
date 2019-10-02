import {map, shareReplay} from 'rxjs/operators';
import {Injectable} from '@angular/core';
import {RequestCache} from '../utils/request-cache';
import {HttpClient} from '@angular/common/http';
import {combineLatest, Observable, of} from 'rxjs';
import {Role, User} from '../models/user';
import {environment} from '../../environments/environment';
import {APIResponse, responseAdapter} from '../models/api-response';
import {createEmptyPaginatedResult, PaginatedResult} from '../utils/paginated-result';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly byID = new RequestCache<string, User>((userID) => {
    return this.http.get<APIResponse<User>>(`${environment.api}/users/${userID}`).pipe(
      map((response) => responseAdapter<User>(response)),
      shareReplay(1)
    );
  });

    private readonly byNameOrEmail = new RequestCache<{q: string, l: number, p: number}, PaginatedResult<User>>(({q, l, p}) => {
    if (q) {
      return this.http.get<APIResponse<PaginatedResult<User>>>(`${environment.api}/users`, {params: {q, l, p}}).pipe(
        map((response) => responseAdapter<PaginatedResult<User>>(response)),
        map((users) => users === null ? createEmptyPaginatedResult<User>() : users),
        shareReplay(1)
      );
    } else {
      return of(createEmptyPaginatedResult<User>());
    }
  }, 10000);

  constructor(private http: HttpClient) {}

  public getByID(userID: string): Observable<User> {
    return this.byID.getObservable(userID);
  }

  public getAllByID(associatedUserIDs: string[]): Observable<User[]> {
    const observables = [] as Observable<User>[];
    for (const id of associatedUserIDs) {
      observables.push(this.getByID(id));
    }

    return combineLatest(observables);
  }

  public searchByNameOrEmail(query: string, limit: number, page: number): Observable<PaginatedResult<User>> {
    return this.byNameOrEmail.getObservable({q: query, l: limit, p: page});
  }

  public createUserWithEmail(email: string): Observable<User> {
    return this.http.post<APIResponse<User>>(`${environment.api}/users`, {
      email,
      anon: true,
      name: '',
      role: 'student'
    }).pipe(
      map((response) => responseAdapter<User>(response)),
    );
  }

  public setRole(user: User, role: Role) {
    return this.http.put<APIResponse<User>>(`${environment.api}/users/${user.id}`, {
      role
    }).pipe(
      map((response) => responseAdapter<User>(response)),
    );
  }
}
