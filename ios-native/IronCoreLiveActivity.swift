import Foundation
import Capacitor
import ActivityKit
import HealthKit

@available(iOS 16.2, *)
struct IronCoreWorkoutAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var exerciseName: String
        var weightKg: Double
        var reps: Int
        var setNumber: Int
        var completedSets: Int
        var totalSets: Int
        var isResting: Bool
    }
    var programName: String
}

@objc(IronCoreLiveActivity)
public class IronCoreLiveActivity: CAPPlugin {
    private let healthStore = HKHealthStore()

    @objc func startOrUpdateActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let exerciseName = call.getString("exerciseName") ?? "IRON CORE"
        let weightKg = call.getDouble("weightKg") ?? 0
        let reps = call.getInt("reps") ?? 0
        let setNumber = call.getInt("setNumber") ?? 1
        let completedSets = call.getInt("completedSets") ?? 0
        let totalSets = call.getInt("totalSets") ?? 1
        let isResting = call.getBool("isResting") ?? false

        let state = IronCoreWorkoutAttributes.ContentState(
            exerciseName: exerciseName,
            weightKg: weightKg,
            reps: reps,
            setNumber: setNumber,
            completedSets: completedSets,
            totalSets: totalSets,
            isResting: isResting
        )

        if let existing = Activity<IronCoreWorkoutAttributes>.activities.first {
            Task {
                await existing.update(using: state)
            }
        } else {
            let attrs = IronCoreWorkoutAttributes(programName: "IRON CORE")
            _ = try? Activity<IronCoreWorkoutAttributes>.request(attributes: attrs, contentState: state, pushType: nil)
        }
        call.resolve(["ok": true])
    }

    @objc func endActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<IronCoreWorkoutAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
        }
        call.resolve(["ok": true])
    }
}
