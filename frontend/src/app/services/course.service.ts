import {Injectable} from '@angular/core';
import {AngularFirestore, AngularFirestoreCollection, QueryFn} from '@angular/fire/firestore';
import {Observable, BehaviorSubject, Subject} from 'rxjs';
import {Course, CoursePath} from '../models/course';
import {CommonService} from './common.service';
import {map, scan, shareReplay, switchMap, tap} from 'rxjs/operators';
import {User} from '../models/user';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment.prod';

class requestCache<T, T2> {
  private readonly timeLimit = 750;
  private readonly requestFunction: (T) => Observable<T2>;
  private cache: {
    key: T,
    time: number,
    observable: Observable<T2>
  }[];

  constructor(request: (T) => Observable<T2>) {
    this.requestFunction = request;
    this.cache = [];
  }

  public getObservable(query: T): Observable<T2> {
    let found = this.cache.find((el) => JSON.stringify(el.key) === JSON.stringify(query));
    if (!found || found.time < Date.now() - this.timeLimit) {
      found = {
        key: query,
        time: Date.now(),
        observable: this.requestFunction(query)
      };

      this.cache.push(found);
    }

    return found.observable;
  }
}

@Injectable({
  providedIn: 'root'
})
export class CourseService {
  private bySlug = new requestCache<{departmentSlug: string, courseSlug: string}, Course>(({departmentSlug, courseSlug}) => {
    return this.http.get<Course>(`${environment.api}/departments/${departmentSlug}/courses/${courseSlug}`).pipe(
      shareReplay(1)
    );
  });

  constructor(private afStore: AngularFirestore,
              private http: HttpClient) {}

  public pageSize = 15;

  public getAll(): CoursePager {
    return new CoursePager(this.afStore,
      'courses',
      (ref) => ref.orderBy('departmentSlug', 'asc')
                  .orderBy('title', 'asc'),
      { limit: this.pageSize }
    );
  }

  public getBySlug(departmentSlug: string, courseSlug: string): Observable<Course> {
    return this.bySlug.getObservable({departmentSlug, courseSlug}).pipe(
      map((courses) => courses[0])
    );
  }

  public getRelevantByDepartment(departmentSlug: string): Observable<Course[]> {
    console.log('called get by department');
    return this.http.get<Course[]>(`${environment.api}/departments/${departmentSlug}/courses`).pipe(
      shareReplay(1)
    );
  }

  public isActualCourse(departmentSlug: string, courseSlug: string): Observable<boolean> {
    return this.getBySlug(departmentSlug, courseSlug).pipe(
      map((course) => {
        return !!course;
      })
    );
  }

  public setCourseEnabled(course: Course, enabled: boolean) {
    if (enabled) {
      return this.http.put<Course>(`${environment.api}/departments/${course.departmentSlug}/courses/${course.slug}`, {
        enabled,
        numTrashCansThisSession: 0
      });
    } else {
      return this.http.put<Course>(`${environment.api}/departments/${course.departmentSlug}/courses/${course.slug}`, {
        enabled,
      });
    }
  }

  public deleteCourse(course: Course) {
    return this.afStore.collection<Course>(CoursePath).doc(course.id).delete();
  }

  public createOrUpdateCourse(course: Course): Promise<void> {
    if (!course.id) {
      // New course, get an autogenerated ID
      const id = this.afStore.collection<Course>(CoursePath).ref.doc().id;
      delete course.id;
      return this.afStore.collection<Course>(CoursePath).doc(id).set(course);
    } else {
      // Course already exists, just update the content
      const id = course.id;
      delete course.id;
      return this.afStore.collection<Course>(CoursePath).ref.doc(id).update(course);
    }
  }

  private getSingle(qFn: QueryFn): Observable<Course> {
    return CommonService.getSingle<Course>(this.afStore, CoursePath, qFn);
  }

  private getMultiple(qFn: QueryFn): Observable<Course[]> {
    return CommonService.getMultiple<Course>(this.afStore, CoursePath, qFn);
  }
}

interface QueryConfig {
  path: string; //  path to collection
  queryFunction: QueryFn; // query function to order and select with
  limit: number; // limit per query
  reverse: boolean; // reverse order?
  prepend: boolean; // prepend to source?
}

export class CoursePager {
  // Source data
  private _done = new BehaviorSubject(false);
  private _loading = new BehaviorSubject(false);
  private _data = new BehaviorSubject([]);

  private query: QueryConfig;

  // Observable data
  data: Observable<any>;
  done: Observable<boolean> = this._done.asObservable();
  loading: Observable<boolean> = this._loading.asObservable();

  // Initial query sets options and defines the Observable
  // passing opts will override the defaults
  constructor(private afs: AngularFirestore, path: string, queryFunction: QueryFn, opts?: any) {
    this.query = {
      path,
      queryFunction,
      limit: 2,
      reverse: false,
      prepend: false,
      ...opts
    };

    const first = this.afs.collection(this.query.path, (ref) => {
      return this.query.queryFunction(ref)
                       .limit(this.query.limit);
    });

    this.mapAndUpdate(first);

    // Create the observable array for consumption in components
    this.data = this._data.asObservable().pipe(
      scan( (acc: any[], val: any[]) => {
        let newvals = [];
        for(let i = 0; i < val.length; i++) {
          let index = acc.findIndex( accItem => accItem.id == val[i].id);
          if(val[i].type === 'removed' && index !== -1) {
            acc.splice(index,1);
          }
          else if(index == -1) {
            newvals.push(val[i]);
          }
          else {
            acc[index] = val[i];
          }
        }

        let result = (this.query.prepend ? newvals.concat(acc) : acc.concat(newvals))
          .map(item => {
            return {
              id: item.id,
              title: item.title,
              slug: item.slug,
              departmentSlug: item.departmentSlug,
              enabled: item.enabled,
              associatedUserIDs: item.associatedUserIDs
            } as Course;
          });
        return result;
      })
    );

  }

  public removeOneHack(removedCourse: Course) {
    let c = this._data.value.find(course => course.id === removedCourse.id);
    c.type = 'removed';
    this._data.next([c]);
  }

  // Retrieves additional data from firestore
  public more() {
    const cursor = this.getCursor();
    const more = this.afs.collection(this.query.path, (ref) => {
      return this.query.queryFunction(ref)
                       .limit(this.query.limit)
                       .startAfter(cursor);
    });
    this.mapAndUpdate(more);
  }


  // Determines the doc snapshot to paginate query
  private getCursor() {
    const current = this._data.value
    if (current.length) {
      return this.query.prepend ? current[0].doc : current[current.length - 1].doc
    }
    return null
  }


  // Maps the snapshot to usable format the updates source
  private mapAndUpdate(col: AngularFirestoreCollection<any>) {
    if (this._done.value || this._loading.value) { return; }

    // loading
    this._loading.next(true);

    // Map snapshot with doc ref (needed for cursor)
    return col.snapshotChanges().pipe(
      tap( arr => {
        let values = arr.map(snap => {
          const data = snap.payload.doc.data();
          // const data = snap.payload.doc.ref.get({source: 'server'});
          const doc = snap.payload.doc;
          const id = snap.payload.doc.id;
          const type = snap.type;
          return { ...data, doc, id, type };
        });

        // If prepending, reverse the batch order
        values = this.query.prepend ? values.reverse() : values;

        // update source with new values, done loading
        this._data.next(values);
        this._loading.next(false);

        // no more values, mark done
        if (values.length < this.query.limit && values.length !== 1) {
          this._done.next(true);
        }
      })
    ).subscribe();
  }

}
