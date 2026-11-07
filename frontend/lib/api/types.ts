export type {
  CarDto,
  CreateCarCommand,
  CreateDocumentCommand,
  CreateHealthMemberCommand,
  DocumentDto,
  DocumentStorageRefDto,
  GetCarsQueryParams,
  GetDocumentsQueryParams,
  GetHealthMembersQueryParams,
  HealthMemberDto,
  UpdateCarCommand,
  UpdateDocumentCommand,
  UpdateHealthMemberCommand,
  LoginRequest,
  LoginResponse,
  SignupRequest,
  SignupResponse,
} from './generated';

export type { CreateHealthReadingCommand } from './generated/life-manager/CreateHealthReadingCommand';
export type { GetHealthReadingsQueryParams } from './generated/life-manager/GetHealthReadingsQueryParams';
export type { HealthReadingDto } from './generated/life-manager/HealthReadingDto';
export type { UpdateHealthReadingCommand } from './generated/life-manager/UpdateHealthReadingCommand';

export type { CreateDoctorVisitCommand } from './generated/life-manager/CreateDoctorVisitCommand';
export type { DoctorVisitDto } from './generated/life-manager/DoctorVisitDto';
export type { GetDoctorVisitsQueryParams } from './generated/life-manager/GetDoctorVisitsQueryParams';
export type { UpdateDoctorVisitCommand } from './generated/life-manager/UpdateDoctorVisitCommand';

export type { CarMaintenanceEventDto } from './generated/life-manager/CarMaintenanceEventDto';
export type { CreateCarMaintenanceEventCommand } from './generated/life-manager/CreateCarMaintenanceEventCommand';
export type { GetCarMaintenanceEventsQueryParams } from './generated/life-manager/GetCarMaintenanceEventsQueryParams';
export type { UpdateCarMaintenanceEventCommand } from './generated/life-manager/UpdateCarMaintenanceEventCommand';
