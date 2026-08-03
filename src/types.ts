export enum PotholeStatus {
  DETECTED = 'DETECTED',
  SENT_TO_GCC = 'SENT_TO_GCC',
  VIEWED = 'VIEWED',
  ACTION_TAKEN = 'ACTION_TAKEN'
}

export enum PotholeSeverity {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE'
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface PotholeHistory {
  status: PotholeStatus;
  timestamp: string;
  remarks?: string;
  actionBy: string;
}

export interface Pothole {
  id?: string;
  location: Location;
  imageUrl: string;
  confidence: number;
  timestamp: string;
  busRouteId: string;
  busId?: string;
  status: PotholeStatus;
  severity: PotholeSeverity;
  locationLink?: string;
  remarks?: string;
  updatedAt?: string;
  history?: PotholeHistory[];
}

export interface Stats {
  total: number;
  sentToGcc: number;
  viewed: number;
  resolved: number;
  byRoute: Record<string, number>;
  bySeverity: Record<string, number>;
}
