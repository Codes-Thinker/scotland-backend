// Canonical enums from docs/API_CONTRACT.md §2. Values are the wire format too.

export enum UserRole {
  Passenger = 'passenger',
  Driver = 'driver',
  Admin = 'admin',
}

export enum AccountStatus {
  Active = 'active',
  Pending = 'pending',
  Suspended = 'suspended',
}

export enum RideStatus {
  Requested = 'requested',
  Assigned = 'assigned',
  Arrived = 'arrived',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum RideType {
  Standard = 'standard',
  Emergency = 'emergency',
  Roadside = 'roadside',
}

export enum BookingMode {
  Now = 'now',
  Later = 'later',
}

export enum VehicleCategory {
  FourSeater = 'four_seater',
  SixSeater = 'six_seater',
  EightSeater = 'eight_seater',
  Wheelchair = 'wheelchair',
}

export enum DispatchPriority {
  Normal = 'normal',
  High = 'high',
  Sos = 'sos',
}

export enum DriverOnlineStatus {
  Offline = 'offline',
  Online = 'online',
  OnTrip = 'on_trip',
}

export enum DriverDocumentType {
  Licence = 'licence',
  CouncilLicence = 'council_licence',
  CouncilPlate = 'council_plate',
  Insurance = 'insurance',
  V5c = 'v5c',
}

export enum DriverDocumentStatus {
  Missing = 'missing',
  Pending = 'pending',
  Verified = 'verified',
  Expired = 'expired',
}

export enum OfferResponse {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Expired = 'expired',
}

export enum RatedByRole {
  Passenger = 'passenger',
  Driver = 'driver',
}

export enum PaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Refunded = 'refunded',
}

export enum PlaceKind {
  Recent = 'recent',
  Popular = 'popular',
  Saved = 'saved',
  Airport = 'airport',
  Transit = 'transit',
}

export enum AlertType {
  Ride = 'ride',
  Scheduled = 'scheduled',
  Promo = 'promo',
  Document = 'document',
  System = 'system',
  Sos = 'sos',
}

export enum ChatSenderType {
  Passenger = 'passenger',
  Driver = 'driver',
  System = 'system',
}
