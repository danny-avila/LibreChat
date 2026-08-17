import { logger } from '@librechat/data-schemas';
import { STATEFUL_CODE_ENVIRONMENTS } from 'librechat-data-provider';
import type { StatefulCodeEnvironment } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';

interface UserPreferencesBody {
  statefulCodeEnvironment?: string;
}

function isStatefulCodeEnvironment(value: string): value is StatefulCodeEnvironment {
  return STATEFUL_CODE_ENVIRONMENTS.some((environment) => environment === value);
}

type UserPreferencesRequest = Request<unknown, unknown, UserPreferencesBody> & {
  user?: IUser;
};

export interface UserPreferencesHandlerDeps {
  updateStatefulCodeEnvironment: (
    userId: string,
    environment: StatefulCodeEnvironment,
  ) => Promise<IUser | null>;
}

export function createUserPreferencesHandler(
  deps: UserPreferencesHandlerDeps,
): (req: UserPreferencesRequest, res: Response) => Promise<Response> {
  return async (req: UserPreferencesRequest, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const environment = req.body?.statefulCodeEnvironment;
    if (typeof environment !== 'string' || !isStatefulCodeEnvironment(environment)) {
      return res.status(400).json({
        message: `statefulCodeEnvironment must be one of: ${STATEFUL_CODE_ENVIRONMENTS.join(', ')}`,
      });
    }

    try {
      const updatedUser = await deps.updateStatefulCodeEnvironment(userId, environment);
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json({
        updated: true,
        preferences: {
          statefulCodeEnvironment:
            updatedUser.personalization?.statefulCodeEnvironment ?? environment,
        },
      });
    } catch (error) {
      logger.error('[UserPreferences] Error updating preferences:', error);
      return res.status(500).json({ message: 'Failed to update user preferences' });
    }
  };
}
